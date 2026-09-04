#!/usr/bin/env node

/**
 * Cursor sessionEnd Hook
 * 用于在会话结束时按需初始化项目根目录下的 .gitlab-ci.yml
 * 仅当项目中存在 .cursor/rules/basic/002-base-rule.mdc 时执行初始化逻辑
 */

const fs = require('fs');
const path = require('path');

const MANAGED_BLOCK_START = '# codex-managed: synced-from-.gitlab-ci.yml:start';
const MANAGED_BLOCK_END = '# codex-managed: synced-from-.gitlab-ci.yml:end';
const BASE_RULE_RELATIVE_PATH = '.cursor/rules/basic/002-base-rule.mdc';
const GITLAB_TEMPLATE = `stages:
  - MergeReview

.review-generate-script: &review-generate-script |
  repo_url="\${CI_PROJECT_URL%/}"
  repo_url="\${repo_url#http://}"
  repo_url="\${repo_url#https://}"
  case "$repo_url" in
    *.git) repo_url="https://\${repo_url}" ;;
    *) repo_url="https://\${repo_url}.git" ;;
  esac

  json_escape() {
    printf '%s' "$1" | sed 's/\\\\/\\\\\\\\/g; s/"/\\\\"/g'
  }

  users_json="$(
    printf '%s\\n' "\${NOTIFY_USERS_RAW:-}" \\
      | tr ',' '\\n' \\
      | sed -E 's/^[[:space:]]+|[[:space:]]+$//g' \\
      | sed -E 's/^.*\\(([^()]+)\\)$/\\1/' \\
      | sed '/^$/d' \\
      | awk '!seen[$0]++' \\
      | awk 'BEGIN { printf "[" } { gsub(/\\\\/,"\\\\\\\\"); gsub(/"/,"\\\\\\""); if (count++) printf ","; printf "\\"%s\\"", $0 } END { printf "]" }'
  )"

  prompt="使用 code-review-skills 技能进行代码审查，审查范围为技能中的review-scope.mjs生成的范围，要求：严格按照要求进行审查，并输出review报告，上传至tac，并上报评分，最终结果通过消息通知发送给以下发送人账号数组：$users_json"
  payload=$(printf '{"type":"codereview","repositoryUrl":"%s","branch":"%s","prompt":"%s"}' \\
    "$(json_escape "$repo_url")" \\
    "$(json_escape "$REVIEW_BRANCH")" \\
    "$(json_escape "$prompt")")

  echo "通知账号数组: $users_json"
  echo "Review 分支: $REVIEW_BRANCH"
  echo "最终Prompt: $prompt"
  echo "开始调用 coding/generate 接口"
  response=$(curl --silent --show-error --fail -X POST 'https://tac-gateway.tuhuyun.cn/coding/generate' \\
    -H 'x-auth-code: ac_feQD6jdWvS6nmgy-DO6hsdI_pgMSypCZ' \\
    -H 'Content-Type: application/json' \\
    -d "$payload")
  echo "接口响应: $response"

# 场景一：feature_xxx 向 release_xxx 发起 MR 时触发（MR 创建/更新）
mr-feature-to-release:
  stage: MergeReview
  script:
    - |
      REVIEW_BRANCH="\${CI_MERGE_REQUEST_SOURCE_BRANCH_NAME}"
      NOTIFY_USERS_RAW="$(
        {
          printf '%s\\n' "\${GITLAB_USER_LOGIN:-}"
          printf '%s\\n' "\${CI_MERGE_REQUEST_ASSIGNEES:-}" | tr ',' '\\n'
        } | sed '/^$/d'
      )"
    - *review-generate-script
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event" && $CI_MERGE_REQUEST_SOURCE_BRANCH_NAME =~ /^feature[-_]/ && $CI_MERGE_REQUEST_TARGET_BRANCH_NAME =~ /^release_/'

# 场景二：feature_xxx 合并到 release_xxx 完成后触发
after-merge-feature-to-release:
  stage: MergeReview
  script:
    - |
      echo "===== Merge 完成信息 ====="
      echo "目标分支: $CI_COMMIT_BRANCH"
      echo "仓库地址: $CI_PROJECT_URL"
      echo "合并操作人: $GITLAB_USER_NAME ($GITLAB_USER_LOGIN)"
      echo "Commit SHA: $CI_COMMIT_SHA"
      echo "Commit信息: $CI_COMMIT_TITLE"
      REVIEW_BRANCH="\${CI_COMMIT_BRANCH}"
      NOTIFY_USERS_RAW="\${GITLAB_USER_LOGIN:-}"
    - *review-generate-script
  rules:
    - if: "$CI_PIPELINE_SOURCE == 'push' && $CI_COMMIT_BRANCH =~ /^release_/ && $CI_COMMIT_TITLE =~ /^Merge branch 'feature[-_]/"
`;

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

function normalizeTrailingNewline(content) {
  return content.endsWith('\n') ? content : `${content}\n`;
}

function buildManagedBlock(sourceContent) {
  return `${MANAGED_BLOCK_START}\n${sourceContent}${MANAGED_BLOCK_END}\n`;
}

function appendManagedBlock(targetContent, sourceContent) {
  const normalizedTarget = normalizeTrailingNewline(targetContent);
  return `${normalizedTarget}\n${buildManagedBlock(sourceContent)}`;
}

function replaceManagedBlock(targetContent, sourceContent) {
  const managedBlockPattern = new RegExp(
    `${MANAGED_BLOCK_START}[\\s\\S]*?${MANAGED_BLOCK_END}\\n?`,
    'g'
  );

  return targetContent.replace(managedBlockPattern, buildManagedBlock(sourceContent));
}

function syncGitlabYml(projectRoot) {
  const targetPath = path.join(projectRoot, '.gitlab-ci.yml');
  const sourceContent = normalizeTrailingNewline(GITLAB_TEMPLATE);

  if (!fs.existsSync(targetPath)) {
    fs.writeFileSync(targetPath, sourceContent, 'utf8');
    return {
      targetPath,
      mode: 'created'
    };
  }

  if (!fs.statSync(targetPath).isFile()) {
    throw new Error(`目标 .gitlab-ci.yml 不是文件：${targetPath}`);
  }

  const targetContent = fs.readFileSync(targetPath, 'utf8');

  if (targetContent === sourceContent) {
    return {
      targetPath,
      mode: 'unchanged'
    };
  }

  const hasManagedBlock = targetContent.includes(MANAGED_BLOCK_START);
  const nextContent = hasManagedBlock
    ? replaceManagedBlock(targetContent, sourceContent)
    : appendManagedBlock(targetContent, sourceContent);

  fs.writeFileSync(targetPath, nextContent, 'utf8');

  return {
    targetPath,
    mode: hasManagedBlock ? 'updated' : 'appended'
  };
}

function executeInitGitlab() {
  const projectRoot = path.resolve(__dirname, '../..');
  const baseRulePath = path.join(projectRoot, BASE_RULE_RELATIVE_PATH);

  if (!fs.existsSync(baseRulePath)) {
    return createSuccessResult(`未检测到 ${BASE_RULE_RELATIVE_PATH}，跳过 .gitlab-ci.yml 初始化。`);
  }

  const result = syncGitlabYml(projectRoot);
  return createSuccessResult(`.gitlab-ci.yml 初始化完成，模式：${result.mode}`);
}

let inputData = '';

process.stdin.on('data', (chunk) => {
  inputData += chunk.toString();
});

process.stdin.on('end', () => {
  try {
    JSON.parse(inputData || '{}');
    outputResult(executeInitGitlab());
  } catch (error) {
    outputResult(createSuccessResult(`initGitlab hook 执行异常，已跳过初始化：${error.message}`));
  }
});

process.stdin.on('error', (error) => {
  outputResult(createSuccessResult(`读取 hook 输入失败，已跳过初始化：${error.message}`));
});
