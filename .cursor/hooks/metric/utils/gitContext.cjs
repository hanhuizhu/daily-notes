/**
 * Git 上下文采集工具
 *
 * 采集分支、用户邮箱、仓库地址，并从分支名解析需求归因。
 * 结果在进程内缓存 30 秒，避免高频 hook 反复调用 git。
 */

const { execSync } = require('child_process');

const CACHE_TTL_MS = 30 * 1000;
const cache = new Map();

function getCached(key) {
  const item = cache.get(key);
  if (!item) {
    return undefined;
  }
  if (Date.now() - item.at > CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return item.value;
}

function setCached(key, value) {
  cache.set(key, { value, at: Date.now() });
}

// 安全执行 git 命令；失败返回空串
function safeGitExec(args, cwd) {
  try {
    const out = execSync(`git ${args}`, {
      cwd: cwd || process.cwd(),
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 2000,
    });
    return String(out || '').trim();
  } catch (err) {
    return '';
  }
}

function getGitBranch(cwd) {
  const key = `branch:${cwd || ''}`;
  const cached = getCached(key);
  if (cached !== undefined) {
    return cached;
  }
  const v =
    safeGitExec('branch --show-current', cwd) ||
    safeGitExec('rev-parse --abbrev-ref HEAD', cwd);
  setCached(key, v);
  return v;
}

function getGitUser(cwd) {
  const key = `user:${cwd || ''}`;
  const cached = getCached(key);
  if (cached !== undefined) {
    return cached;
  }
  const v = safeGitExec('config user.email', cwd);
  setCached(key, v);
  return v;
}

function getGitRepoUrl(cwd) {
  const key = `repo:${cwd || ''}`;
  const cached = getCached(key);
  if (cached !== undefined) {
    return cached;
  }
  const v = safeGitExec('config --get remote.origin.url', cwd);
  setCached(key, v);
  return v;
}

/**
 * 从分支名解析需求归因。
 * story/task 分支优先，老分支继续按 requirement_id 兼容。
 */
function parseBranchAttribution(branch) {
  if (!branch) {
    return {
      requirement_id: '',
      branch_type: 'unknown',
      branch_ref_id: '',
      task_id: '',
      story_id: '',
      story_resolve_status: '',
    };
  }
  const storyMatch = branch.match(/(?:^|[_/-])story[_/-](\d+)(?:$|[_/-])/i);
  if (storyMatch) {
    return {
      requirement_id: storyMatch[1],
      branch_type: 'story',
      branch_ref_id: storyMatch[1],
      task_id: '',
      story_id: storyMatch[1],
      story_resolve_status: 'direct',
    };
  }
  const taskMatch = branch.match(/(?:^|[_/-])task[_/-](\d+)(?:$|[_/-])/i);
  if (taskMatch) {
    return {
      requirement_id: '',
      branch_type: 'task',
      branch_ref_id: taskMatch[1],
      task_id: taskMatch[1],
      story_id: '',
      story_resolve_status: 'pending',
    };
  }
  const upperMatch = branch.match(/[A-Z]+-\d+/);
  if (upperMatch) {
    return {
      requirement_id: upperMatch[0],
      branch_type: 'story',
      branch_ref_id: upperMatch[0],
      task_id: '',
      story_id: upperMatch[0],
      story_resolve_status: 'direct',
    };
  }
  const numMatch = branch.match(/\d{5,}/);
  if (numMatch) {
    return {
      requirement_id: numMatch[0],
      branch_type: 'story',
      branch_ref_id: numMatch[0],
      task_id: '',
      story_id: numMatch[0],
      story_resolve_status: 'direct',
    };
  }
  return {
    requirement_id: branch,
    branch_type: 'unknown',
    branch_ref_id: '',
    task_id: '',
    story_id: '',
    story_resolve_status: '',
  };
}

function parseRequirementId(branch) {
  return parseBranchAttribution(branch).requirement_id;
}

function getGitContext(cwd) {
  const branch = getGitBranch(cwd);
  const attribution = parseBranchAttribution(branch);
  return {
    git_branch: branch,
    git_user: getGitUser(cwd),
    git_repo_url: getGitRepoUrl(cwd),
    requirement_id: attribution.requirement_id,
    branch_type: attribution.branch_type,
    branch_ref_id: attribution.branch_ref_id,
    task_id: attribution.task_id,
    story_id: attribution.story_id,
    story_resolve_status: attribution.story_resolve_status,
  };
}

module.exports = {
  getGitBranch,
  getGitUser,
  getGitRepoUrl,
  parseBranchAttribution,
  parseRequirementId,
  getGitContext,
};
