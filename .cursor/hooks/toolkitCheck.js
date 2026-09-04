#!/usr/bin/env node

/**
 * Cursor afterAgentResponse Hook
 * 用于在Agent响应完成后自动执行cursor-toolkit命令
 * 根据项目中.cursor/rules/basic/002-base-rule.mdc文件的存在性和内容来决定执行的命令:
 * - 文件不存在: 执行 cursor-toolkit init hooks (仅初始化hooks)
 * - 文件存在且包含'cursor-toolkit init h5': 执行 cursor-toolkit init h5 (H5项目初始化)
 * - 文件存在但不包含'cursor-toolkit init h5': 执行 cursor-toolkit init (完整初始化)
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

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
 * 创建失败结果对象(但仍然允许继续)
 * @param {string} message - 错误信息
 * @returns {Object} 结果对象
 */
const createFailureResult = (message) => ({
  continue: true,
  user_message: message
});

/**
 * 检查项目中是否存在002-base-rule.mdc文件
 * @param {string} projectRoot - 项目根目录
 * @returns {boolean} 文件是否存在
 */
const checkBaseRuleExists = (projectRoot) => {
  const baseRulePath = path.join(projectRoot, '.cursor/rules/basic/002-base-rule.mdc');
  return fs.existsSync(baseRulePath);
};

/**
 * 读取002-base-rule.mdc文件内容并检查是否包含特定命令
 * @param {string} projectRoot - 项目根目录
 * @returns {string|null} 返回需要执行的命令，如果文件不存在则返回null
 */
const getToolkitCommandFromBaseRule = (projectRoot) => {
  const baseRulePath = path.join(projectRoot, '.cursor/rules/basic/002-base-rule.mdc');

  // 如果文件不存在，返回null
  if (!fs.existsSync(baseRulePath)) {
    return null;
  }

  try {
    // 读取文件内容
    const content = fs.readFileSync(baseRulePath, 'utf-8');

    // 检查是否包含 'cursor-toolkit init h5'
    if (content.includes('cursor-toolkit init h5')) {
      return 'cursor-toolkit init h5';
    }

    // 默认返回 cursor-toolkit init
    return 'cursor-toolkit init';
  } catch (error) {
    // 读取失败时返回默认命令
    return 'cursor-toolkit init';
  }
};

/**
 * 执行cursor-toolkit命令
 * 根据项目配置决定执行init、init h5或init hooks
 * @returns {Object} 执行结果
 */
const executeToolkitInit = () => {
  try {
    // 获取项目根目录
    const projectRoot = path.resolve(__dirname, '../..');

    // 从002-base-rule.mdc文件中获取需要执行的命令
    const commandFromBaseRule = getToolkitCommandFromBaseRule(projectRoot);

    let command;
    let commandDesc;

    if (commandFromBaseRule === null) {
      // 文件不存在，执行 cursor-toolkit init hooks
      command = 'cursor-toolkit init hooks';
      commandDesc = 'cursor-toolkit hooks初始化';
    } else {
      // 文件存在，使用文件中解析的命令
      command = commandFromBaseRule;
      commandDesc = command === 'cursor-toolkit init h5'
        ? 'cursor-toolkit H5项目初始化'
        : 'cursor-toolkit完整初始化';
    }

    // 执行cursor-toolkit命令
    const result = execSync(command, {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: 'pipe'
    });

    return {
      success: true,
      message: `✅ ${commandDesc}成功\n执行命令: ${command}\n${result.trim()}`
    };
  } catch (error) {
    return {
      success: false,
      message: `⚠️ cursor-toolkit更新失败: ${error.message}\n但不影响后续执行。`
    };
  }
};

// 读取stdin输入
let inputData = '';

process.stdin.on('data', (chunk) => {
  inputData += chunk.toString();
});

process.stdin.on('end', () => {
  try {
    // 解析输入的JSON数据(虽然可能不需要使用,但保持统一格式)
    const data = JSON.parse(inputData || '{}');

    // 执行cursor-toolkit命令
    const executionResult = executeToolkitInit();

    // 无论成功失败,都允许继续(因为这是afterAgentResponse hook)
    if (executionResult.success) {
      outputResult(createSuccessResult(executionResult.message));
    } else {
      outputResult(createFailureResult(executionResult.message));
    }

  } catch (error) {
    // 解析错误时,允许继续执行
    const errorMessage = `⚠️ afterAgentResponse hook执行出错: ${error.message}\n默认允许继续执行。`;
    outputResult(createFailureResult(errorMessage));
  }
});

// 处理stdin读取错误
process.stdin.on('error', (error) => {
  const errorMessage = `⚠️ 读取输入数据失败: ${error.message}\n默认允许继续执行。`;
  outputResult(createFailureResult(errorMessage));
});
