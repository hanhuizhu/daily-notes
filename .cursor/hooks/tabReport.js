#!/usr/bin/env node

/** genAI_hooks_start */
/**
 * Cursor afterTabFileEdit Hook
 * 用于在Tab文件编辑后触发，处理Tab补全新增代码的场景
 * 计算代码hash并输出到日志文件
 * 场景1：old_line为空，new_line有值
 * 场景2：old_line和new_line相同，old_string为空，new_string有值
 */

/* genAI_hooks_start */
const { computeCodeHash } = require('./utils/codeHashUtil');
const { getLogFilePath, readExistingLog, writeLog } = require('./utils/logPathUtil');
/* genAI_hooks_end */

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
// 场景判断函数
// ============================================================

/**
 * 判断是否为Tab新增代码场景
 * @param {Object} editData - 编辑数据对象
 * @returns {boolean} 是否为新增场景
 */
function isTabAddScenario(editData) {
  const oldLine = (editData.old_line || '').trim();
  const newLine = (editData.new_line || '').trim();
  const oldString = (editData.old_string || '').trim();
  const newString = (editData.new_string || '').trim();

  // 场景1：old_line为空，new_line有值
  const scenario1 = !oldLine && newLine;

  // 场景2：old_line和new_line相同，old_string为空，new_string有值
  const scenario2 = oldLine === newLine && !oldString && newString;

  return scenario1 || scenario2;
}

/**
 * 获取匹配的场景描述
 * @param {Object} editData - 编辑数据对象
 * @returns {string} 场景描述
 */
function getScenarioDescription(editData) {
  const oldLine = (editData.old_line || '').trim();
  const newLine = (editData.new_line || '').trim();
  const oldString = (editData.old_string || '').trim();
  const newString = (editData.new_string || '').trim();

  if (!oldLine && newLine) {
    return '场景1: old_line为空，new_line有值';
  }
  if (oldLine === newLine && !oldString && newString) {
    return '场景2: old_line和new_line相同，old_string为空，new_string有值';
  }
  return '非新增场景';
}

// ============================================================
// 日志输出函数
// ============================================================

/**
 * 打印基本信息
 * @param {string} filePath - 文件路径
 * @param {string} scenario - 场景描述
 */
function printBasicInfo(filePath, scenario) {
  collectLog('🔖 Tab补全代码处理');
  collectSeparator();
  collectLog(`  文件路径: ${filePath}`);
  collectLog(`  匹配场景: ${scenario}`);
  collectLog('');
}

/**
 * 打印统计信息
 * @param {number} addedCount - 新增行数
 */
function printStatistics(addedCount) {
  collectLog('📊 统计信息');
  collectSeparator();
  collectLog(`  🟢 新增行数: ${addedCount}`);
  collectLog('');
}

/**
 * 打印完成信息
 * @param {string} logFile - 日志文件路径
 */
function printComplete(logFile) {
  collectLog('✅ 处理完成');
  collectSeparator();
  collectLog(`  日志已写入: ${logFile}`);
  collectLog('');
}

// ============================================================
// 核心处理函数
// ============================================================

/**
 * 处理Tab补全数据
 * @param {Object} jsonData - hooks传入的JSON数据
 */
function processTabData(jsonData) {
  // 使用统一的日志路径工具获取日志文件路径
  const filePath = jsonData.file_path || '';
  const workspaceRoots = jsonData.workspace_roots || [];
  const logFile = getLogFilePath(filePath, workspaceRoots);

  // 检查edits数组长度，大于1时跳过处理
  const editsLength = jsonData.edits && jsonData.edits.length ? jsonData.edits.length : 0;
  if (editsLength > 1) {
    collectLog(`⚠️ edits数组长度为${editsLength}，大于1，跳过处理`);
    outputResult({ message: `edits数组长度为${editsLength}，跳过处理` });
    return;
  }

  // 提取编辑数据
  const editData = jsonData.edits && jsonData.edits[0] ? jsonData.edits[0] : null;
  if (!editData) {
    collectLog('⚠️ 无法从JSON中提取edits数据');
    outputResult({ message: '无法提取edits数据' });
    return;
  }

  // 判断是否为Tab新增场景
  const isAddScenario = isTabAddScenario(editData);
  const scenarioDesc = getScenarioDescription(editData);

  // 打印基本信息
  printBasicInfo(filePath, scenarioDesc);

  // 非新增场景，退出处理
  if (!isAddScenario) {
    collectLog('⚠️ 非Tab新增代码场景，不进行后续处理');
    outputResult({ message: '非Tab新增代码场景' });
    return;
  }

  // 提取new_string并按换行符拆分
  const newString = editData.new_string || '';
  let codeLines = newString.split('\n');

  // 去除首尾的空行（换行符拆分产生的空字符串）
  if (codeLines.length > 0 && codeLines[0] === '') {
    codeLines.shift();
  }
  if (codeLines.length > 0 && codeLines[codeLines.length - 1] === '') {
    codeLines.pop();
  }

  // 获取起始行号
  const startLineNumber = editData.range && editData.range.start_line_number ? editData.range.start_line_number : 1;

  // 计算每行代码的hash
  const codeContent = codeLines.map((content, index) => ({
    line: startLineNumber + index,
    codeHash: computeCodeHash(content),
  }));

  // 打印统计信息
  printStatistics(codeLines.length);

  // 构建输出记录
  const currentTime = getCurrentTime();
  const newRecord = {
    generation_id: jsonData.generation_id || '',
    filePath: getRelativeProjectPath(filePath, workspaceRoots),
    type: 'tab',
    addLines: codeLines.length,
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

    // 处理Tab补全数据
    processTabData(data);

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
/** genAI_hooks_end */
