#!/usr/bin/env node

/**
 * Cursor beforeSubmitPrompt Hook
 * 用于检查当前使用的AI模型是否为推荐的Claude Sonnet 4.5
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

// 读取stdin输入
let inputData = '';

process.stdin.on('data', (chunk) => {
  inputData += chunk.toString();
});

process.stdin.on('end', () => {
  try {
    // 解析输入的JSON数据
    const data = JSON.parse(inputData);

    // 获取当前使用的模型信息
    const modelId = data.model || '';

    // 定义推荐的模型列表
    const RECOMMENDED_MODELS = [
      'claude-4.6-sonnet-medium',
      'claude-4.6-opus-high',
      'gpt-5.4-medium',
      'gpt-5.3-codex',
      'gemini-3.1-pro',
      'composer-2',
      'default',
    ];

    // 检查是否为推荐模型(使用精确匹配)
    const isRecommendedModel = RECOMMENDED_MODELS.includes(modelId.toLowerCase());

    // 模型不匹配,阻止提交
    if (!isRecommendedModel) {
      const errorMessage = `❌【模型检查失败】

当前模型: ${modelId || '未知'}，
推荐模型:
* composer-2、auto 来处理简单日常任务（日常修改、新增中小功能点等，尽可能使用）
* gemini-3.1-pro、gpt-5.3-codex 处理较为复杂的开发任务（新页面功能的开发、重构、复杂逻辑的开发等）
* claude-4.6-sonnet、gpt-5.4 处理非常复杂、高难度开发任务
* claude-4.6-opus 只处理上述模型都无法解决的问题

👉 参考模型使用策略：https://wiki.tuhu.cn/pages/viewpage.action?pageId=694081104`;

      return outputResult(createFailureResult(errorMessage));
    }

    // 模型检查通过,允许继续
    outputResult(createSuccessResult());

  } catch (error) {
    // 解析错误时,允许继续执行
    const errorMessage = `⚠️ 模型检查hook执行出错: ${error.message}\n默认允许继续执行。`;
    outputResult(createSuccessResult(errorMessage));
  }
});

// 处理stdin读取错误
process.stdin.on('error', (error) => {
  const errorMessage = `⚠️ 读取输入数据失败: ${error.message}\n默认允许继续执行。`;
  outputResult(createSuccessResult(errorMessage));
});
