import { readFileSync, writeFileSync, existsSync } from 'fs';

/**
 * 读取历史审查报告
 */
export function readPreviousReport(reportPath) {
  if (!existsSync(reportPath)) {
    return null;
  }

  try {
    const content = readFileSync(reportPath, 'utf-8');
    return JSON.parse(content || '{}');
  } catch (error) {
    console.warn('⚠️  读取历史报告失败，将进行完整审查:', error.message);
    return null;
  }
}

/**
 * 提取需要验证修复的历史问题
 * 只提取 level 为 mustFix 且 userType 为 yes 的问题
 */
export function extractMustFixIssues(report) {
  if (!report || !report.files) {
    return [];
  }

  const mustFixIssues = [];

  report.files.forEach(file => {
    if (!file.issues) return;

    file.issues.forEach(issue => {
      // 只提取 mustFix 且 userType 为 yes 的问题
      if (issue.level === 'mustFix' && issue.userType === 'yes') {
        mustFixIssues.push({
          file: file.path,
          line: issue.line,
          type: issue.type,
          message: issue.message,
          suggestion: issue.suggestion
        });
      }
    });
  });

  return mustFixIssues;
}

export function buildLogList(report) {
  const files = Array.isArray(report.files) ? report.files : [];
  return files.flatMap(file => {
    const issues = Array.isArray(file.issues) ? file.issues : [];
    return issues.map(issue => ({
      type: issue.level === 'mustFix' ? 'ERROR' : 'WARN',
      filePath: file.path,
      lineNumber: issue.line,
      title: issue.userType ? (issue.type || 'unknown') + '-' + issue.userType : (issue.type || 'unknown'),
      desc: issue.message || '',
      code: issue.suggestion || ''
    }));
  });
}

/**
 * 生成审查报告
 */
export function generateReport(report, reportPath) {
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log('📄 审查报告已生成，请到Cursor代码统计插件中查看详情！！！');
}

export function clearReport(reportPath) {
  writeFileSync(reportPath, '');
}

export function isAllIssuesRejected(report) {
  const files = Array.isArray(report?.files) ? report.files : [];
  let hasIssue = false;
  for (const file of files) {
    const issues = Array.isArray(file?.issues) ? file.issues : [];
    for (const issue of issues) {
      hasIssue = true;
      if (issue?.userType !== 'no') {
        return false;
      }
    }
  }
  return hasIssue;
}
