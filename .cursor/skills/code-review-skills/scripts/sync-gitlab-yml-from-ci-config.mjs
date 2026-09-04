#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MANAGED_BLOCK_START = "# codex-managed: synced-from-.gitlab-ci.yml:start";
const MANAGED_BLOCK_END = "# codex-managed: synced-from-.gitlab-ci.yml:end";

function parseArgs(argv) {
  const options = {
    repoRoot: resolveDefaultRepoRoot(),
    template: "",
    target: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--repo-root" && argv[index + 1]) {
      options.repoRoot = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--template" && argv[index + 1]) {
      options.template = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--target" && argv[index + 1]) {
      options.target = path.resolve(argv[index + 1]);
      index += 1;
    }
  }

  return options;
}

function resolveDefaultRepoRoot() {
  const currentFileDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentFileDir, "..", "..", "..", "..");
}

function resolveDefaultTemplatePath() {
  const currentFileDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentFileDir, "..", "templates", "gitlab.yml");
}

function ensureFile(filePath, label) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`${label}不存在：${filePath}`);
  }
}

function normalizeTrailingNewline(content) {
  return content.endsWith("\n") ? content : `${content}\n`;
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
    "g",
  );

  return targetContent.replace(managedBlockPattern, buildManagedBlock(sourceContent));
}

export function syncGitlabYmlFromCiConfig(rawOptions = []) {
  const options = Array.isArray(rawOptions)
    ? parseArgs(rawOptions)
    : {
        repoRoot: resolveDefaultRepoRoot(),
        source: "",
        target: "",
        ...rawOptions,
      };
  const repoRoot = path.resolve(options.repoRoot || resolveDefaultRepoRoot());
  const sourcePath = options.template ? path.resolve(options.template) : resolveDefaultTemplatePath();
  const targetPath = options.target ? path.resolve(options.target) : path.join(repoRoot, ".gitlab-ci.yml");

  ensureFile(sourcePath, "skill 模板 gitlab.yml");

  const sourceContent = normalizeTrailingNewline(fs.readFileSync(sourcePath, "utf8"));

  if (!fs.existsSync(targetPath)) {
    fs.writeFileSync(targetPath, sourceContent, "utf8");
    return {
      repoRoot,
      sourcePath,
      targetPath,
      mode: "created",
    };
  }

  if (!fs.statSync(targetPath).isFile()) {
    throw new Error(`目标 .gitlab-ci.yml 不是文件：${targetPath}`);
  }

  const targetContent = fs.readFileSync(targetPath, "utf8");

  if (targetContent === sourceContent) {
    return {
      repoRoot,
      sourcePath,
      targetPath,
      mode: "unchanged",
    };
  }

  const nextContent = targetContent.includes(MANAGED_BLOCK_START)
    ? replaceManagedBlock(targetContent, sourceContent)
    : appendManagedBlock(targetContent, sourceContent);

  fs.writeFileSync(targetPath, nextContent, "utf8");

  return {
    repoRoot,
    sourcePath,
    targetPath,
    mode: targetContent.includes(MANAGED_BLOCK_START) ? "updated" : "appended",
  };
}

function main() {
  const result = syncGitlabYmlFromCiConfig(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (
  process.argv[1] &&
  fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(path.resolve(process.argv[1]))
) {
  main();
}
