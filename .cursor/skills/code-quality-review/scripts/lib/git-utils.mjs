import { execSync, spawnSync } from 'child_process';

/**
 * 获取 staged 文件列表
 */
export function getStagedFiles() {
  try {
    const output = execSync('git diff --cached --name-only --diff-filter=ACM', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return output.trim().split('\n').filter(Boolean);
  } catch (error) {
    console.error('❌ 获取 staged 文件失败:', error.message);
    return [];
  }
}

/**
 * 过滤需要审查的文件
 */
export function filterReviewableFiles(files) {
  const excludePatterns = [
    /^\.cursor\//,
    /^\.husky\//,
    /^\.gradle\//,
    /^\.idea\//,
    /package-lock\.json$/,
    /package\.json$/,
    /yarn\.lock$/,
    /pnpm-lock\.yaml$/,
    /\.min\.(js|css)$/,
    /\.config\.(js|ts)$/,
    /^dist\//,
    /^build\//,
    /^node_modules\//,
    /^src\/apis\//,
    /^src\/auto-apis\//,
    /^src\/mbfApis\//,
    /^src\/mbf-apis\//,
    /^src\/autoApi\//,
    /^src\/autoApis\//,
    /^openspec\//,
    /^pub_static\//,
    /^scripts\/precommit-ai-review\.mjs$/,
    /^scripts\/ai-review-prompt\.txt$/,
    /^\.ai-review-ignore\.json$/,
    /\.md$/,
    /\.json$/,
    /\.map$/,
    /\.d\.ts$/,
  ];

  const includeExtensions = ['.js', '.ts', '.jsx', '.tsx', '.vue', '.css', '.scss', '.less'];

  return files.filter(file => {
    // 排除特定模式
    if (excludePatterns.some(pattern => pattern.test(file))) {
      return false;
    }

    // 只包含特定扩展名
    return includeExtensions.some(ext => file.endsWith(ext));
  });
}

/**
 * 获取 git diff 内容（仅包含指定文件的变更，与 filterReviewableFiles 保持一致）
 * @param {string[]} [filePaths] - 仅对这些文件取 diff，不传则取全部 staged（一般不推荐）
 * @returns {string}
 */
export function getGitDiff(filePaths = []) {
  try {
    const args = ['diff', '--cached', '--unified=3'];
    if (filePaths.length > 0) {
      args.push('--', ...filePaths);
    }
    const result = spawnSync('git', args, {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024, // 10MB
      stdio: ['pipe', 'pipe', 'pipe']
    });
    if (result.status !== 0 && result.stderr) {
      console.error('❌ 获取 git diff 失败:', result.stderr.trim());
      return '';
    }
    return result.stdout || '';
  } catch (error) {
    console.error('❌ 获取 git diff 失败:', error.message);
    return '';
  }
}

export function normalizeGitAddress(rawAddress) {
  if (!rawAddress) return '';
  if (rawAddress.startsWith('git@')) return rawAddress;
  const httpsMatch = rawAddress.match(/^https?:\/\/([^/]+)\/(.+)$/);
  if (!httpsMatch) return rawAddress;
  const host = httpsMatch[1];
  const repoPath = httpsMatch[2];
  return `git@${host}:${repoPath}`;
}

export function getGitAddress() {
  try {
    const raw = execSync('git remote get-url origin', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
    return normalizeGitAddress(raw);
  } catch (error) {
    console.warn('⚠️  获取 gitAddress 失败:', error.message);
    return '';
  }
}

export function getBranchName() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
  } catch (error) {
    console.warn('⚠️  获取分支失败:', error.message);
    return '';
  }
}

export function getCreatorEmail() {
  try {
    return execSync('git config user.email', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
  } catch (error) {
    console.warn('⚠️  获取提交邮箱失败:', error.message);
    return '';
  }
}
