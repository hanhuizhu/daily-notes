#!/usr/bin/env node

/**
 * Cursor beforeSubmitPrompt Hook
 * 用于检查当前Cursor版本是否>=2.0
 * 如果不是,则阻止prompt提交并向用户显示错误信息
 */


/**
 * 输出结果到stdout
 * @param {Object} result - 返回结果对象
 */
const outputResult = (result) => {
  console.log(JSON.stringify(result));
};

/**
 * 创建允许继续的结果对象
 * @param {string} message - 可选的提示信息
 * @returns {Object} 结果对象
 */
const createSuccessResult = (message) => {
  const result = { continue: true };
  if (message) {
    result.user_message = message;
  }
  return result;
};

/**
 * 创建阻止继续的结果对象
 * @param {string} message - 错误信息
 * @returns {Object} 结果对象
 */
const createFailureResult = (message) => ({
  continue: false,
  user_message: message
});

/**
 * 解析版本号字符串为数字数组
 * @param {string} version - 版本号字符串,如 "2.1.3"
 * @returns {number[]} 版本号数组,如 [2, 1, 3]
 */
const parseVersion = (version) => {
  if (!version || typeof version !== 'string') {
    return [0, 0, 0];
  }

  const parts = version.split('.');
  return [
    parseInt(parts[0]) || 0,
    parseInt(parts[1]) || 0,
    parseInt(parts[2]) || 0
  ];
};

/**
 * 比较两个版本号
 * @param {string} version1 - 当前版本
 * @param {string} version2 - 目标版本
 * @returns {number} 1表示version1>version2, 0表示相等, -1表示version1<version2
 */
const compareVersions = (version1, version2) => {
  const v1 = parseVersion(version1);
  const v2 = parseVersion(version2);

  for (let i = 0; i < 3; i++) {
    if (v1[i] > v2[i]) return 1;
    if (v1[i] < v2[i]) return -1;
  }

  return 0;
};

// 读取stdin输入
let inputData = '';

process.stdin.on('data', (chunk) => {
  inputData += chunk.toString();
});

process.stdin.on('end', () => {
  try {
    // 解析输入的JSON数据
    const data = JSON.parse(inputData);

    // 获取当前Cursor版本信息
    const cursorVersion = data.cursor_version || '';

    // 定义最低要求版本
    const MIN_REQUIRED_VERSION = '2.0.0';

    // 比较版本号
    const comparisonResult = compareVersions(cursorVersion, MIN_REQUIRED_VERSION);

    // 版本不满足要求,阻止提交
    if (comparisonResult < 0) {
      const errorMessage = `⚠️ 【Cursor版本检查失败】

当前版本: ${cursorVersion || '未知'}
要求版本: >= ${MIN_REQUIRED_VERSION}

❌ 为确保功能正常,请升级到Cursor ${MIN_REQUIRED_VERSION}或更高版本后再提交。

提示：访问 https://cursor.com/cn/download 下载最新版本的Cursor。`;

      return outputResult(createFailureResult(errorMessage));
    }

    // 版本检查通过,不输出任何内容,让后续 hook 继续执行
    // 注意：不要调用 outputResult，否则会中断后续 hook 的执行

  } catch (error) {
    // 解析错误时,不输出,让后续 hook 继续执行
  }
});

// 处理stdin读取错误
process.stdin.on('error', (error) => {
  // stdin读取错误时,让后续 hook 继续执行
});

