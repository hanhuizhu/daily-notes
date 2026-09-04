#!/usr/bin/env node

/**
 * Cursor afterFileEdit Hook
 * 用于在Agent文件编辑后触发，处理代码差异对比
 * 计算新增代码hash并输出到日志文件
 */

const { computeCodeHash } = require('./utils/codeHashUtil');
const { getLogFilePath, readExistingLog, writeLog } = require('./utils/logPathUtil');

// ============================================================
// 日志收集器 - 收集所有日志，最后统一输出
// ============================================================

const logCollector = [];

/**
 * 收集日志信息
 * @param {string} message - 日志信息
 */
function collectLog(message) {
  logCollector.push(message);
}

/**
 * 收集分隔线
 */
function collectSeparator() {
  collectLog('━'.repeat(80));
}

// ============================================================
// 辅助函数
// ============================================================

/* genAI_feature-ai5_start */
/**
 * 截取项目目录下的相对路径
 * @param {string} fullPath - 完整文件路径
 * @param {Array<string>} workspaceRoots - 工作区根目录列表
 * @returns {string} 项目目录下的相对路径（不带前导斜杠）
 */
function getRelativeProjectPath(fullPath, workspaceRoots) {
  if (!fullPath) {
    return '';
  }

  // 优先使用workspace_roots匹配项目根目录
  let projectRoot = null;
  if (workspaceRoots && workspaceRoots.length > 0) {
    // 遍历workspace_roots，找到匹配的项目根目录
    for (const root of workspaceRoots) {
      if (fullPath.startsWith(root)) {
        // 如果有多个匹配，选择最长的路径（更精确的匹配）
        if (!projectRoot || root.length > projectRoot.length) {
          projectRoot = root;
        }
      }
    }
  }

  // 如果没有匹配到，使用process.cwd()作为兜底
  if (!projectRoot) {
    projectRoot = process.cwd();
  }

  let relativePath = fullPath;
  // 如果路径包含项目根目录，则截取相对路径
  if (fullPath.startsWith(projectRoot)) {
    relativePath = fullPath.substring(projectRoot.length);
  } else {
    // 如果不包含，尝试从src开始截取
    const srcIndex = fullPath.indexOf('/src/');
    if (srcIndex !== -1) {
      relativePath = fullPath.substring(srcIndex);
    }
  }
  // 去掉前导斜杠
  return relativePath.startsWith('/') ? relativePath.substring(1) : relativePath;
}
/* genAI_feature-ai5_end */

/**
 * 获取当前时间格式化字符串
 * @returns {string} 格式化时间 YYYY-MM-DD HH:mm:ss
 */
function getCurrentTime() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}


/**
 * 输出最终结果到stdout（包含日志和返回值）
 * @param {Object} result - 返回结果对象
 */
const outputResult = (result) => {
  // 将日志信息放入result中一起输出
  const finalResult = {
    ...result,
    logs: logCollector
  };
  console.log(JSON.stringify(finalResult));
};

// ============================================================
// LCS差异对比算法
// ============================================================

/**
 * 简单的LCS（最长公共子序列）算法实现
 * 用于找出两个字符串数组的差异
 * @param {Array} arr1 - 原始数组
 * @param {Array} arr2 - 新数组
 * @returns {Array} LCS矩阵
 */
function computeLCS(arr1, arr2) {
  const m = arr1.length;
  const n = arr2.length;
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  // 构建LCS长度矩阵
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (arr1[i - 1] === arr2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  return dp;
}

/**
 * 回溯LCS矩阵，生成diff结果
 * @param {Array} arr1 - 原始数组
 * @param {Array} arr2 - 新数组
 * @returns {Array} diff结果数组
 */
function generateDiff(arr1, arr2) {
  const dp = computeLCS(arr1, arr2);
  const diff = [];
  let i = arr1.length;
  let j = arr2.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && arr1[i - 1] === arr2[j - 1]) {
      // 相同的行
      diff.unshift({ type: 'equal', oldLine: i, newLine: j, content: arr1[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      // 新增的行
      diff.unshift({ type: 'added', oldLine: null, newLine: j, content: arr2[j - 1] });
      j--;
    } else if (i > 0) {
      // 删除的行
      diff.unshift({ type: 'deleted', oldLine: i, newLine: null, content: arr1[i - 1] });
      i--;
    }
  }

  return diff;
}

// ============================================================
// 日志输出函数
// ============================================================

/**
 * 打印基本信息
 * @param {string} filePath - 文件路径
 */
function printBasicInfo(filePath) {
  collectLog(`  文件路径: ${filePath}`);
  collectLog('');
}

/**
 * 打印统计信息
 * @param {number} addedCount - 新增行数
 * @param {number} deletedCount - 删除行数
 */
function printStatistics(addedCount, deletedCount) {
  collectLog(`  🟢 新增行数: ${addedCount}`);
  collectLog(`  🔴 删除行数: ${deletedCount}`);
  collectLog('');
}

/**
 * 打印完成信息
 * @param {string} logFile - 日志文件路径
 */
function printComplete(logFile) {
  collectLog('✅ 处理完成');
  collectLog(`  日志已写入: ${logFile}`);
  collectLog('');
}

// ============================================================
// 核心处理函数
// ============================================================

/**
 * 处理Agent编辑数据
 * @param {Object} jsonData - hooks传入的JSON数据
 */
function processEditData(jsonData) {
  // 使用统一的日志路径工具获取日志文件路径
  const filePath = jsonData.file_path || '';
  const workspaceRoots = jsonData.workspace_roots || [];
  const logFile = getLogFilePath(filePath, workspaceRoots);

  // 提取编辑数据数组
  const editsArray = jsonData.edits;
  if (!editsArray || !Array.isArray(editsArray) || editsArray.length === 0) {
    collectLog('⚠️ 无法从JSON中提取edits数据');
    outputResult({ message: '无法提取edits数据' });
    return;
  }

  // 打印基本信息
  printBasicInfo(filePath);

  // 累计所有edit的新增和删除行
  let totalAddedLines = [];
  let totalDeletedLines = [];

  // 遍历每个edit进行diff处理
  for (let editIndex = 0; editIndex < editsArray.length; editIndex++) {
    const editData = editsArray[editIndex];

    // 提取old_string和new_string
    const oldString = editData.old_string || '';
    const newString = editData.new_string || '';

    // 跳过空的编辑
    if (!oldString && !newString) {
      collectLog(`⚠️ edits[${editIndex}] 的old_string和new_string都为空，跳过`);
      continue;
    }

    // 分割成行
    const oldLines = oldString.split('\n');
    const newLines = newString.split('\n');

    // 生成diff
    const diffResult = generateDiff(oldLines, newLines);

    // 提取删除和新增的行（过滤空白行，空白行不计入统计）
    const deletedLines = diffResult
      .filter(item => item.type === 'deleted' && item.content.trim() !== '')
      .map(item => ({
        old_line: item.oldLine,
        content: item.content,
        editIndex: editIndex // 记录来源edit索引
      }));
    const addedLines = diffResult
      .filter(item => item.type === 'added' && item.content.trim() !== '')
      .map(item => ({
        new_line: item.newLine,
        content: item.content,
        editIndex: editIndex // 记录来源edit索引
      }));

    // 累计到总数组
    totalAddedLines = totalAddedLines.concat(addedLines);
    totalDeletedLines = totalDeletedLines.concat(deletedLines);
  }

  // 打印总统计信息
  collectLog('');
  printStatistics(totalAddedLines.length, totalDeletedLines.length);

  // 为新增的每一行生成codeContent记录
  const codeContent = totalAddedLines.map(item => ({
    line: item.new_line,
    codeHash: computeCodeHash(item.content),
    editIndex: item.editIndex // 保留来源edit索引
  }));

  // 构建输出记录
  const currentTime = getCurrentTime();
  const generationId = jsonData.generation_id || '';

  const newRecord = {
    generation_id: generationId,
    filePath: getRelativeProjectPath(filePath, workspaceRoots),
    type: 'agent',
    addLines: totalAddedLines.length,
    deleteLines: totalDeletedLines.length,
    editsCount: editsArray.length, // 记录本次处理的edit数量
    codeContent: codeContent,
    time: currentTime
  };

  // 读取现有日志并增量写入
  const existingRecords = readExistingLog(logFile);
  const allRecords = [...existingRecords, newRecord];
  writeLog(logFile, allRecords);

  // 打印完成信息
  printComplete(logFile);

  // 返回成功结果
  outputResult({ message: 'hooks success!' });
}

// ============================================================
// 主程序 - 读取stdin输入
// ============================================================

let inputData = '';

process.stdin.on('data', (chunk) => {
  inputData += chunk.toString();
});

process.stdin.on('end', () => {
  try {
    // 解析输入的JSON数据
    const data = JSON.parse(inputData);

    // 处理Agent编辑数据
    processEditData(data);

  } catch (error) {
    collectLog(`解析错误: ${error.message}`);
    outputResult({ message: `解析错误: ${error.message}` });
  }
});

// 处理stdin读取错误
process.stdin.on('error', (error) => {
  collectLog(`读取输入失败: ${error.message}`);
  outputResult({ message: `读取输入失败: ${error.message}` });
});
