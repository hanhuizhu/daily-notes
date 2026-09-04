#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { computeScore } from "./lib/review-score.mjs";

const DEFAULT_API_URL =
  "https://office-gateway.tuhuyun.cn/cl-dfe-asset-manage/inner-office/ai-metric/requirements/review-report";
const DEFAULT_TIMEOUT_MS = Number(process.env.REVIEW_METRIC_TIMEOUT || 120000);

function parseArgs(argv) {
  const options = {
    json: "",
    crReportUrl: "",
    gitBranch: "",
    apiUrl: process.env.REVIEW_METRIC_API_URL || DEFAULT_API_URL,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--json" && argv[index + 1]) {
      options.json = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--cr-report-url" && argv[index + 1]) {
      options.crReportUrl = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--git-branch" && argv[index + 1]) {
      options.gitBranch = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--api-url" && argv[index + 1]) {
      options.apiUrl = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--timeout" && argv[index + 1]) {
      options.timeoutMs = Number(argv[index + 1]) || DEFAULT_TIMEOUT_MS;
      index += 1;
      continue;
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
    }
  }

  if (!options.json) {
    throw new Error("Missing required --json <path>");
  }

  if (!options.crReportUrl) {
    throw new Error("Missing required --cr-report-url <url>");
  }

  return options;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function resolveGitBranch(explicitBranch) {
  if (explicitBranch) {
    return explicitBranch;
  }

  const branch = execSync("git branch --show-current", {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

  if (!branch) {
    throw new Error("未获取到当前 git 分支，请通过 --git-branch 显式传入。");
  }

  return branch;
}

async function postMetric({ apiUrl, payload, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const rawText = await response.text();
    let parsed = null;

    if (rawText.trim()) {
      try {
        parsed = JSON.parse(rawText);
      } catch (error) {
        throw new Error(`上报接口返回了非 JSON 响应：${rawText.slice(0, 500)}`);
      }
    }

    if (!response.ok) {
      throw new Error(`上报失败，HTTP ${response.status}：${JSON.stringify(parsed)}`);
    }

    return parsed;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`上报超时，超过 ${timeoutMs}ms。`);
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function reportReviewMetric(rawOptions) {
  const options =
    Array.isArray(rawOptions) ? parseArgs(rawOptions) : { ...parseArgs(["--json", "placeholder", "--cr-report-url", "placeholder"]), ...rawOptions };
  const jsonPath = path.resolve(options.json);

  if (!fs.existsSync(jsonPath) || !fs.statSync(jsonPath).isFile()) {
    throw new Error(`找不到 findings JSON：${jsonPath}`);
  }

  const report = readJson(jsonPath);
  const findings = Array.isArray(report.findings) ? report.findings : [];
  const score = computeScore(findings);
  const payload = {
    gitBranch: resolveGitBranch(options.gitBranch),
    qualityScore: score.score,
    crReportUrl: options.crReportUrl,
    reportDetails: findings,
  };

  if (options.dryRun) {
    return {
      dryRun: true,
      jsonPath,
      payload,
    };
  }

  const response = await postMetric({
    apiUrl: options.apiUrl,
    payload,
    timeoutMs: options.timeoutMs,
  });

  return {
    jsonPath,
    payload,
    response,
  };
}

async function main() {
  const result = await reportReviewMetric(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}
