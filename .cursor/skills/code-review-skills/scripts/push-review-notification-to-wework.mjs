#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveGitUserEmail,
  resolveReviewRecipient,
} from "./lib/review-recipient.mjs";

const DEFAULT_API_URL =
  process.env.REVIEW_WEWORK_PUSH_API_URL || "https://yewu-gateway.tuhu.cn/cl-scm-common-service/weixin-work/push-markdown-generic";
const DEFAULT_TIMEOUT_MS = Number(process.env.REVIEW_WEWORK_PUSH_TIMEOUT || 120000);

function parseArgs(argv) {
  const options = {
    previewUrl: "",
    qualityScore: "",
    requirementName: "",
    reviewJson: "",
    gitBranch: "",
    userEmail: "",
    apiUrl: DEFAULT_API_URL,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--preview-url" && argv[index + 1]) {
      options.previewUrl = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--quality-score" && argv[index + 1]) {
      options.qualityScore = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--requirement-name" && argv[index + 1]) {
      options.requirementName = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--review-json" && argv[index + 1]) {
      options.reviewJson = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--git-branch" && argv[index + 1]) {
      options.gitBranch = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--user-email" && argv[index + 1]) {
      options.userEmail = argv[index + 1];
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

  if (!options.previewUrl) {
    throw new Error("Missing required --preview-url <url>");
  }

  if (!options.qualityScore) {
    throw new Error("Missing required --quality-score <score>");
  }

  return options;
}

function normalizeNotificationText(value, fallback) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  const escapedHtml = (text || fallback)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return escapedHtml.replace(/([\\`*_[\]{}()#+!|])/g, "\\$1");
}

function normalizeReady(value) {
  const raw = String(value || "").trim();
  const mapping = {
    Yes: "可直接合入",
    No: "不可合入",
    "With fixes": "需修复后再合入",
  };

  return normalizeNotificationText(mapping[raw] || raw, "未明确");
}

function readReviewSummary(reviewJson) {
  if (!reviewJson) {
    return null;
  }

  const jsonPath = path.resolve(reviewJson);
  if (!fs.existsSync(jsonPath) || !fs.statSync(jsonPath).isFile()) {
    throw new Error(`找不到 review findings JSON：${jsonPath}`);
  }

  let report;
  try {
    report = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  } catch (error) {
    throw new Error(`review findings JSON 解析失败：${jsonPath}`);
  }

  const normalizedReport = report && typeof report === "object" ? report : {};
  const findings = Array.isArray(normalizedReport.findings) ? normalizedReport.findings : [];
  const summary =
    normalizedReport.summary && typeof normalizedReport.summary === "object"
      ? normalizedReport.summary
      : {};

  return {
    mustFixTitles: findings
      .filter((finding) => finding?.mustFix === true)
      .map((finding) => {
        const title = String(finding.title ?? "").trim();
        const problem = String(finding.problem ?? "").trim();
        return normalizeNotificationText(title || problem, "未命名问题");
      }),
    reasoning: normalizeNotificationText(summary.reasoning, "无补充说明"),
    ready: normalizeReady(summary.ready),
  };
}

function buildContent({ qualityScore, previewUrl, gitBranch, requirementName, reviewSummary }) {
  const lines = ["# 代码审查完成通知", ""];

  if (gitBranch) {
    lines.push(`分支：\`${gitBranch}\``);
  }

  if (requirementName) {
    lines.push(`需求名称：${requirementName}`);
  }

  if (reviewSummary) {
    lines.push("必须修复的问题：");
    if (reviewSummary.mustFixTitles.length === 0) {
      lines.push("无");
    } else {
      reviewSummary.mustFixTitles.forEach((title, index) => {
        lines.push(`${index + 1}、<font color="warning">${title}</font>`);
      });
    }
    lines.push(`Review 总结：${reviewSummary.reasoning}`);
    lines.push(`是否可合并：${reviewSummary.ready}`);
  }

  lines.push(`质量分：\`${qualityScore}\``);
  lines.push(`Review 报告在线地址：[点击查看报告](${previewUrl})`);

  return lines.join("\n");
}

async function postNotification({ apiUrl, payload, timeoutMs }) {
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
        parsed = rawText;
      }
    }

    if (!response.ok) {
      throw new Error(`企微推送失败，HTTP ${response.status}：${JSON.stringify(parsed)}`);
    }

    return parsed;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`企微推送超时，超过 ${timeoutMs}ms。`);
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function pushReviewNotificationToWework(rawOptions) {
  const options =
    Array.isArray(rawOptions)
      ? parseArgs(rawOptions)
      : { ...parseArgs(["--preview-url", "placeholder", "--quality-score", "0"]), ...rawOptions };
  const explicitUserEmail = (options.userEmail && options.userEmail.trim()) || "";
  const reviewSummary = readReviewSummary(options.reviewJson);
  const gitUserEmail = resolveGitUserEmail();
  const userEmail = resolveReviewRecipient({
    explicitUserEmail,
    gitUserEmail,
  });

  if (!userEmail) {
    return {
      skipped: true,
      reason: "missing_or_invalid_notification_user",
      explicitUserEmail: explicitUserEmail || null,
      gitUserEmail: gitUserEmail || null,
    };
  }

  const payload = {
    users: [userEmail],
    content: buildContent({
      qualityScore: options.qualityScore,
      previewUrl: options.previewUrl,
      gitBranch: options.gitBranch,
      requirementName: options.requirementName,
      reviewSummary,
    }),
  };

  if (options.dryRun) {
    return {
      dryRun: true,
      apiUrl: options.apiUrl,
      payload,
    };
  }

  const response = await postNotification({
    apiUrl: options.apiUrl,
    payload,
    timeoutMs: options.timeoutMs,
  });

  return {
    apiUrl: options.apiUrl,
    payload,
    response,
  };
}

async function main() {
  const result = await pushReviewNotificationToWework(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}
