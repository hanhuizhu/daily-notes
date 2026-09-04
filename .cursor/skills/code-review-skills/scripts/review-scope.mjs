#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_BASE_REF = "origin/master";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = process.cwd();
const ignoreConfigPath = path.join(__dirname, "review-ignore.json");

function parseArgs(argv) {
  const options = {
    baseRef: DEFAULT_BASE_REF,
    json: false,
    patch: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--base-ref" && argv[index + 1]) {
      options.baseRef = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    if (arg === "--patch") {
      options.patch = true;
    }
  }

  return options;
}

function runGit(args, encoding = "utf8") {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function runGitText(args) {
  return runGit(args, "utf8").trim();
}

function runGitBuffer(args) {
  return runGit(args, "buffer");
}

function splitLines(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function splitNullSeparated(buffer) {
  return buffer
    .toString("utf8")
    .split("\u0000")
    .map((line) => line.trim())
    .filter(Boolean);
}

function escapeRegex(text) {
  return text.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function globToRegex(pattern) {
  const normalized = pattern.replace(/\\/g, "/").replace(/^\*\*\//, "(?:.*/)?");
  let source = "";

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];

    if (normalized.slice(index, index + 8) === "(?:.*/)?") {
      source += "(?:.*/)?";
      index += 7;
      continue;
    }

    if (char === "*") {
      source += next === "*" ? ".*" : "[^/]*";
      if (next === "*") {
        index += 1;
      }
      continue;
    }

    if (char === "?") {
      source += ".";
      continue;
    }

    source += escapeRegex(char);
  }

  return new RegExp(`^${source}$`);
}

function loadIgnoreRules() {
  const raw = fs.readFileSync(ignoreConfigPath, "utf8");
  const parsed = JSON.parse(raw);
  const entries = Array.isArray(parsed.entries) ? parsed.entries : [];

  return entries
    .filter((entry) => entry && typeof entry.pattern === "string")
    .map((entry) => ({
      pattern: entry.pattern,
      reason: typeof entry.reason === "string" ? entry.reason : "",
      regex: globToRegex(entry.pattern),
    }));
}

function findIgnoreRule(filePath, ignoreRules) {
  return ignoreRules.find((rule) => rule.regex.test(filePath)) || null;
}

function listCommits(baseRef) {
  const output = runGitText(["log", "--reverse", "--pretty=format:%H\t%h\t%s", `${baseRef}..HEAD`]);

  return splitLines(output).map((line) => {
    const [sha = "", shortSha = "", ...subjectParts] = line.split("\t");
    return {
      sha,
      shortSha,
      subject: subjectParts.join("\t"),
    };
  });
}

function listChangedFiles(compareRange) {
  const output = runGitBuffer([
    "-c",
    "core.quotepath=false",
    "diff",
    "--name-only",
    "-z",
    compareRange,
  ]);

  return splitNullSeparated(output);
}

function buildScope({ baseRef, patch }) {
  const mergeBase = runGitText(["merge-base", "HEAD", baseRef]);
  const compareRange = `${mergeBase}..HEAD`;
  const commits = listCommits(mergeBase);
  const ignoreRules = loadIgnoreRules();
  const changedFiles = listChangedFiles(compareRange);

  const includedFiles = [];
  const ignoredFiles = [];

  for (const filePath of changedFiles) {
    const ignoreRule = findIgnoreRule(filePath, ignoreRules);

    if (ignoreRule) {
      ignoredFiles.push({
        path: filePath,
        pattern: ignoreRule.pattern,
        reason: ignoreRule.reason,
      });
      continue;
    }

    includedFiles.push(filePath);
  }

  return {
    currentBranch: runGitText(["branch", "--show-current"]),
    baseRef,
    mergeBase,
    commitCount: commits.length,
    commits,
    includedFiles,
    ignoredFiles,
    patch:
      patch && includedFiles.length > 0
        ? runGitText(["diff", compareRange, "--", ...includedFiles])
        : "",
  };
}

function printScope(scope) {
  console.log(`currentBranch: ${scope.currentBranch}`);
  console.log(`baseRef: ${scope.baseRef}`);
  console.log(`mergeBase: ${scope.mergeBase}`);
  console.log(`commitCount: ${scope.commitCount}`);
  console.log("");

  console.log("commits:");
  if (scope.commits.length === 0) {
    console.log("- none");
  } else {
    for (const commit of scope.commits) {
      console.log(`- ${commit.shortSha} ${commit.subject}`);
    }
  }

  console.log("");
  console.log("includedFiles:");
  if (scope.includedFiles.length === 0) {
    console.log("- none");
  } else {
    for (const filePath of scope.includedFiles) {
      console.log(`- ${filePath}`);
    }
  }

  console.log("");
  console.log("ignoredFiles:");
  if (scope.ignoredFiles.length === 0) {
    console.log("- none");
  } else {
    for (const file of scope.ignoredFiles) {
      const reasonSuffix = file.reason ? ` (${file.reason})` : "";
      console.log(`- ${file.path} <- ${file.pattern}${reasonSuffix}`);
    }
  }

  if (scope.patch) {
    console.log("");
    console.log("patch:");
    console.log(scope.patch);
  }
}

try {
  const options = parseArgs(process.argv.slice(2));
  const scope = buildScope(options);

  if (options.json) {
    process.stdout.write(`${JSON.stringify(scope, null, 2)}\n`);
  } else {
    printScope(scope);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
