/** genAI_hooks_start */
/**
 * 日志路径工具函数
 * 用于生成统一的日志存储路径
 * 路径格式：~/.cursor-hooks/{project}/{branch}.json
 * project = 上级目录名-当前项目名
 * branch = 当前git分支名
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

/** genAI_feature-ai2_start */
/**
 * 获取当前git分支名
 * @param {string} projectRoot - 项目根目录路径（可选）
 * @returns {string} 分支名，获取失败返回 'unknown'
 */
function getCurrentBranch(projectRoot) {
  try {
    // 如果传入了项目根目录，则在该目录下执行git命令
    const options = {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    };

    // 如果指定了项目根目录，设置cwd
    if (projectRoot) {
      options.cwd = projectRoot;
    }

    const branch = execSync('git branch --show-current', options).trim();
    return branch || 'unknown';
  } catch (error) {
    return 'unknown';
  }
}

/**
 * 获取匹配的项目根目录
 * @param {string} filePath - 文件路径
 * @param {Array<string>} workspaceRoots - 工作区根目录列表
 * @returns {string|null} 匹配的项目根目录，未匹配返回null
 */
function getMatchedProjectRoot(filePath, workspaceRoots) {
  if (!filePath || !workspaceRoots || workspaceRoots.length === 0) {
    return null;
  }

  // 遍历workspace_roots，找到匹配的项目根目录
  let matchedRoot = null;
  for (const root of workspaceRoots) {
    if (filePath.startsWith(root)) {
      // 如果有多个匹配，选择最长的路径（更精确的匹配）
      if (!matchedRoot || root.length > matchedRoot.length) {
        matchedRoot = root;
      }
    }
  }

  return matchedRoot;
}
/** genAI_feature-ai2_end */

/**
 * 获取项目标识（上级目录名-当前项目名）
 * @param {string} filePath - 文件路径
 * @param {Array<string>} workspaceRoots - 工作区根目录列表
 * @returns {string} 项目标识，如 'code-tms-carrier-admin'
 */
function getProjectIdentifier(filePath, workspaceRoots) {
  try {
    /** genAI_feature-ai2_start */
    // 获取匹配的项目根目录
    const matchedRoot = getMatchedProjectRoot(filePath, workspaceRoots);

    // 如果找到匹配的根目录
    if (matchedRoot) {
      // 获取当前项目名称
      const projectName = path.basename(matchedRoot);
      // 获取上级目录名称
      const parentDir = path.dirname(matchedRoot);
      const parentName = path.basename(parentDir);
      // 拼接项目标识
      return `${parentName}-${projectName}`;
    }
    /** genAI_feature-ai2_end */

    // 如果没有匹配到，使用兜底方案
    const cwd = process.cwd();
    const projectName = path.basename(cwd);
    const parentDir = path.dirname(cwd);
    const parentName = path.basename(parentDir);
    return `${parentName}-${projectName}`;
  } catch (error) {
    return 'unknown-project';
  }
}

/**
 * 获取日志文件完整路径
 * 路径格式：~/.cursor-hooks/{project}/{branch}.json
 * @param {string} filePath - 文件路径（可选）
 * @param {Array<string>} workspaceRoots - 工作区根目录列表（可选）
 * @returns {string} 日志文件完整路径
 */
function getLogFilePath(filePath, workspaceRoots) {
  const homeDir = os.homedir();

  // 获取匹配的项目根目录
  const matchedRoot = getMatchedProjectRoot(filePath, workspaceRoots);

  // 获取项目标识
  const projectIdentifier = getProjectIdentifier(filePath, workspaceRoots);

  // 根据匹配的项目根目录获取分支名
  const branch = getCurrentBranch(matchedRoot);

  // 构建路径：~/.cursor-hooks/{project}/{branch}.json
  const logDir = path.join(homeDir, '.cursor-hooks', projectIdentifier);
  const logFile = path.join(logDir, `${branch}.json`);

  return logFile;
}

/**
 * 确保日志目录存在
 * @param {string} logFilePath - 日志文件路径
 */
function ensureLogDir(logFilePath) {
  const dir = path.dirname(logFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * 读取现有的日志文件
 * @param {string} logFilePath - 日志文件路径
 * @returns {Array} 现有日志数据
 */
function readExistingLog(logFilePath) {
  try {
    if (fs.existsSync(logFilePath)) {
      const content = fs.readFileSync(logFilePath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    // 读取失败，返回空数组
  }
  return [];
}

/**
 * 写入日志文件
 * @param {string} logFilePath - 日志文件路径
 * @param {Array} data - 日志数据
 */
function writeLog(logFilePath, data) {
  ensureLogDir(logFilePath);
  // 每个对象压缩成一行展示
  const jsonLines = data.map(item => JSON.stringify(item));
  const content = '[\n' + jsonLines.join(',\n') + '\n]\n';
  fs.writeFileSync(logFilePath, content, 'utf-8');
}

module.exports = {
  getCurrentBranch,
  getProjectIdentifier,
  getLogFilePath,
  ensureLogDir,
  readExistingLog,
  writeLog
};
/** genAI_hooks_end */
