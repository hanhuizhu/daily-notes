#!/usr/bin/env node

/**
 * Cursor beforeSubmitPrompt Hook
 */

const path = require('path');
const { getLogFilePath } = require('./utils/logPathUtil');
const { getReporter } = require('./utils/lighthouse-report');

function outputResult(result) {
  console.log(JSON.stringify(result));
}

function createSuccessResult(message) {
  const result = { continue: true };
  if (message) {
    result.user_message = message;
  }
  return result;
}

function parseInput(rawInput) {
  try {
    return JSON.parse(rawInput || '{}');
  } catch (error) {
    return {};
  }
}

function findPromptInValue(value, visited = new WeakSet()) {
  if (!value) {
    return '';
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value !== 'object') {
    return '';
  }

  if (visited.has(value)) {
    return '';
  }
  visited.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      const prompt = findPromptInValue(item, visited);
      if (prompt) {
        return prompt;
      }
    }
    return '';
  }

  const priorityKeys = ['prompt', 'message', 'text', 'input', 'content'];
  for (const key of priorityKeys) {
    if (typeof value[key] === 'string' && value[key].trim()) {
      return value[key].trim();
    }
  }

  for (const [key, child] of Object.entries(value)) {
    if (!/(prompt|message|text|input|content)/i.test(key)) {
      continue;
    }

    const prompt = findPromptInValue(child, visited);
    if (prompt) {
      return prompt;
    }
  }

  return '';
}

function getPromptContent(data) {
  const directFields = ['prompt', 'message', 'text', 'input', 'user_input'];
  for (const field of directFields) {
    if (typeof data[field] === 'string' && data[field].trim()) {
      return data[field].trim();
    }
  }

  return findPromptInValue(data);
}

function getProjectName(filePath, workspaceRoots) {
  let matchedRoot = '';

  for (const root of workspaceRoots) {
    if (filePath.startsWith(root) && root.length > matchedRoot.length) {
      matchedRoot = root;
    }
  }

  if (matchedRoot) {
    return path.basename(matchedRoot);
  }

  return path.basename(process.cwd());
}

function getTrackingName(data) {
  const workspaceRoots = Array.isArray(data.workspace_roots) ? data.workspace_roots : [];
  const filePath = data.file_path || data.current_file || workspaceRoots[0] || process.cwd();
  const logFilePath = getLogFilePath(filePath, workspaceRoots);
  const projectName = getProjectName(filePath, workspaceRoots);
  const branchName = path.basename(logFilePath, path.extname(logFilePath));
  return `${projectName}_${branchName}`;
}

async function reportPrompt(data) {
  const prompt = getPromptContent(data);
  if (!prompt) {
    return;
  }

  const name = getTrackingName(data);
  const reporter = getReporter();
  await reporter.pv('cursor.beforeSubmitPrompt', { name, prompt });
}

let inputData = '';

process.stdin.on('data', chunk => {
  inputData += chunk.toString();
});

process.stdin.on('end', async () => {
  try {
    const data = parseInput(inputData);
    await reportPrompt(data);
    outputResult(createSuccessResult());
  } catch (error) {
    const errorMessage = `⚠️ prompt 上报异常: ${error.message}\n默认允许继续执行。`;
    outputResult(createSuccessResult(errorMessage));
  }
});

process.stdin.on('error', error => {
  const errorMessage = `⚠️ 读取 prompt hook 输入失败: ${error.message}\n默认允许继续执行。`;
  outputResult(createSuccessResult(errorMessage));
});
