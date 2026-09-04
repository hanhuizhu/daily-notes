#!/usr/bin/env node

import { join } from 'path';
import { getStagedFiles, filterReviewableFiles, getGitDiff, getGitAddress, getBranchName, getCreatorEmail } from './lib/git-utils.mjs';
import { readPreviousReport, extractMustFixIssues, buildLogList, generateReport, clearReport, isAllIssuesRejected } from './lib/report-utils.mjs';
import { buildPrompt } from './lib/prompt-builder.mjs';
import { callLLMApi } from './lib/llm-client.mjs';
import { uploadReviewReport } from './lib/report-uploader.mjs';
import { printReviewResult, startProgress, printBlockingTips } from './lib/output.mjs';
import { getReporter } from './lib/lighthouse-report.mjs';

// 历史审查报告路径
const REVIEW_REPORT_PATH = '.ai-review-report.json';
const REVIEW_REPORT_ABS = join(process.cwd(), REVIEW_REPORT_PATH);

/**
 * 解析 AI 返回结果
 */
function parseAIResponse(response) {
  try {
    // 尝试提取 JSON 内容（AI 可能会在前后添加说明文字）
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    // 如果没有找到 JSON，尝试直接解析
    return JSON.parse(response);
  } catch (error) {
    console.error('❌ 解析 AI 响应失败，返回内容不是有效的 JSON');
    console.error('AI 返回内容:', response.substring(0, 500));
    const reporter = getReporter();
    reporter
      .pv('review_fail', {
        reason: 'invalid_llm_json',
        detail: error.message,
        response: response.substring(0, 500)
      })
      .finally(() => process.exit(1));
    return null;
  }
}

function formatTimestamp(date) {
  const pad = (value) => String(value).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function addIssueIndexes(report) {
  let index = 0;
  const files = Array.isArray(report?.files) ? report.files : [];
  files.forEach(file => {
    const issues = Array.isArray(file?.issues) ? file.issues : [];
    issues.forEach(issue => {
      issue.index = index;
      index += 1;
    });
  });
}

/**
 * 主函数
 */
async function main() {
  console.log('🔍 开始 AI 代码审查...\n');

  // 1. 获取 staged 文件检查是否有变更
  const stagedFiles = getStagedFiles();

  if (stagedFiles.length === 0) {
    console.log('ℹ️  没有 staged 文件，跳过审查');
    clearReport(REVIEW_REPORT_ABS);
    process.exit(0);
  }

  // 2. 过滤需要审查的文件
  const reviewableFiles = filterReviewableFiles(stagedFiles);

  if (reviewableFiles.length === 0) {
    console.log('ℹ️  没有需要审查的文件，跳过审查');
    clearReport(REVIEW_REPORT_ABS);
    process.exit(0);
  }

  console.log(`📝 将审查 ${reviewableFiles.length} 个文件:\n`);
  reviewableFiles.forEach(file => console.log(`   - ${file}`));
  console.log('');

  // 3. 仅获取可审查文件的 git diff，避免无关文件导致内容过大
  const gitDiff = getGitDiff(reviewableFiles);

  if (!gitDiff) {
    console.log('ℹ️  没有代码变更，跳过审查');
    clearReport(REVIEW_REPORT_ABS);
    process.exit(0);
  }

  // 4. 读取历史报告并提取需要验证修复的问题
  const previousReport = readPreviousReport(REVIEW_REPORT_ABS);
  if (previousReport && isAllIssuesRejected(previousReport)) {
    console.log('ℹ️  历史报告中所有问题均标记为误报，跳过审查');
    clearReport(REVIEW_REPORT_ABS);
    process.exit(0);
  }
  const mustFixIssues = extractMustFixIssues(previousReport);

  if (mustFixIssues.length > 0) {
    console.log(`⚠️  发现 ${mustFixIssues.length} 个历史遗留的 mustFix 问题，将优先验证这些问题是否已修复\n`);
  }

  // 5. 构建提示词（如果有历史问题，传入历史问题进行修复验证）
  const fullPrompt = buildPrompt(reviewableFiles, gitDiff, mustFixIssues);

  // 6. 调用 LLM API 进行代码审查
  const reviewMode = mustFixIssues.length > 0 ? '历史问题修复验证' : '完整代码审查';
  console.log(`🎯 正在调用模型 API 进行质量检测（${reviewMode}模式）...`);
  await getReporter().pv('review_triggered', { mode: reviewMode, fileCount: reviewableFiles.length });
  const stopProgress = startProgress('🤖 AI 正在进行代码审查，请等待片刻...');
  const aiResponse = await callLLMApi(fullPrompt);

  stopProgress();

  // 7. 解析 AI 响应
  let report = parseAIResponse(aiResponse);

  // 8. 为每个问题添加全局索引
  addIssueIndexes(report);

  // 9. 添加时间戳
  report.timestamp = formatTimestamp(new Date());
  report.commitHash = 'staged';

  // 10. 输出结果
  printReviewResult(report);

  // 11. 上报结果
  const reportId = await uploadReviewReport(report, {
    getGitAddress,
    getBranchName,
    getCreatorEmail,
    buildLogList
  });
  if (reportId !== null && reportId !== undefined && reportId !== '') {
    report.id = reportId;
  }

  // 12. 生成/更新审查报告
  generateReport(report, REVIEW_REPORT_ABS);

  // 13. 根据 mustFix 数量决定是否阻断
  if (report.summary.mustFix > 0) {
    console.log('❌ 发现必须修复的问题，提交已阻断！');
    await getReporter().pv('review_issues_found', {
      mustFix: report.summary.mustFix,
      shouldFix: report.summary.shouldFix,
      total: report.summary.total
    });
    printBlockingTips();
    process.exit(1);
  }

  if (report.summary.shouldFix > 0) {
    console.log('⚠️  发现建议修复的问题，但不阻断提交');
    console.log('💡 建议在后续提交中修复这些问题\n');
  }

  await getReporter().pv('review_pass', { mustFix: report.summary.mustFix });
  console.log('✅ 代码审查通过，允许提交\n');
  process.exit(0);
}

// 执行主函数
main().catch(async error => {
  console.error('❌ 审查过程出错:', error);
  await getReporter().pv('review_fail', { reason: 'review_exception', detail: error?.message || '' });
  process.exit(1);
});
