#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateReviewReport } from "./render-review-report.mjs";
import {
  publishReviewReportToTac,
  resolveCodingReportName,
} from "./publish-review-report-to-tac.mjs";
import { reportReviewMetric } from "./report-review-metric.mjs";
import { pushReviewNotificationToWework } from "./push-review-notification-to-wework.mjs";
import { syncGitlabYmlFromCiConfig } from "./sync-gitlab-yml-from-ci-config.mjs";
import {
  resolveGitUserEmail,
  resolveReviewRecipient,
} from "./lib/review-recipient.mjs";

function parseArgs(argv) {
  const options = {
    input: "",
    outputDir: "",
    scriptsDir: "",
    title: "",
    gitBranch: "",
    userEmail: "",
    tacTimeoutMs: null,
    metricTimeoutMs: null,
    weworkTimeoutMs: null,
    tacBaseUrl: "",
    metricApiUrl: "",
    weworkApiUrl: "",
    metricDryRun: false,
    weworkDryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--input" && argv[index + 1]) {
      options.input = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--output-dir" && argv[index + 1]) {
      options.outputDir = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--scripts-dir" && argv[index + 1]) {
      options.scriptsDir = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--title" && argv[index + 1]) {
      options.title = argv[index + 1];
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

    if (arg === "--tac-timeout" && argv[index + 1]) {
      options.tacTimeoutMs = Number(argv[index + 1]) || null;
      index += 1;
      continue;
    }

    if (arg === "--metric-timeout" && argv[index + 1]) {
      options.metricTimeoutMs = Number(argv[index + 1]) || null;
      index += 1;
      continue;
    }

    if (arg === "--wework-timeout" && argv[index + 1]) {
      options.weworkTimeoutMs = Number(argv[index + 1]) || null;
      index += 1;
      continue;
    }

    if (arg === "--tac-base-url" && argv[index + 1]) {
      options.tacBaseUrl = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--metric-api-url" && argv[index + 1]) {
      options.metricApiUrl = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--wework-api-url" && argv[index + 1]) {
      options.weworkApiUrl = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--metric-dry-run") {
      options.metricDryRun = true;
      continue;
    }

    if (arg === "--wework-dry-run") {
      options.weworkDryRun = true;
      continue;
    }

    if (!arg.startsWith("-") && !options.input) {
      options.input = arg;
    }
  }

  if (!options.input) {
    throw new Error("Missing required --input <review-findings.json>");
  }

  return options;
}

function buildTimestampDirName(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  return formatter.format(date).replace(" ", "_").replace(/:/g, "-");
}

function resolveOutputDir(explicitOutputDir) {
  if (explicitOutputDir) {
    return path.resolve(explicitOutputDir);
  }

  return path.resolve(process.cwd(), "docs", "superpowers", "reports", buildTimestampDirName());
}

function resolveScriptsDir(explicitScriptsDir) {
  if (explicitScriptsDir) {
    return path.resolve(explicitScriptsDir);
  }

  return path.dirname(fileURLToPath(import.meta.url));
}

function ensureFile(filePath, label) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`${label}不存在：${filePath}`);
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function resolveRequirementName(report) {
  const meta = report && typeof report === "object" ? report.meta : null;
  const inputContext = meta && typeof meta.inputContext === "object" ? meta.inputContext : null;

  return (
    (meta && typeof meta.title === "string" && meta.title.trim()) ||
    (inputContext && typeof inputContext.sourceLabel === "string" && inputContext.sourceLabel.trim()) ||
    ""
  );
}

export function resolveNotificationUser(
  report,
  explicitUserEmail = "",
  gitUserEmail = resolveGitUserEmail(),
) {
  const meta = report && typeof report === "object" ? report.meta : null;
  const inputContext = meta && typeof meta.inputContext === "object" ? meta.inputContext : null;
  const assignedTo =
    typeof inputContext?.assignedTo === "string" ? inputContext.assignedTo.trim() : "";

  return resolveReviewRecipient({
    explicitUserEmail,
    gitUserEmail,
    assignedTo,
  });
}

function buildMetricArgs({ jsonPath, previewUrl, options }) {
  const metricArgs = [
    "--json",
    jsonPath,
    "--cr-report-url",
    previewUrl,
  ];

  if (options.metricTimeoutMs) {
    metricArgs.push("--timeout", String(options.metricTimeoutMs));
  }
  if (options.metricApiUrl) {
    metricArgs.push("--api-url", options.metricApiUrl);
  }
  if (options.gitBranch) {
    metricArgs.push("--git-branch", options.gitBranch);
  }

  return metricArgs;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(options.input);
  const outputDir = resolveOutputDir(options.outputDir);
  const scriptsDir = resolveScriptsDir(options.scriptsDir);
  const htmlPath = path.join(outputDir, "review-report.html");
  const jsonPath = path.join(outputDir, "review-findings.json");

  ensureFile(inputPath, "输入 findings JSON");
  const renderArgs = ["--input", inputPath, "--output-dir", outputDir];
  if (options.title) {
    renderArgs.push("--title", options.title);
  }

  generateReviewReport(renderArgs);
  ensureFile(htmlPath, "HTML 审查报告");
  ensureFile(jsonPath, "输出 findings JSON");
  const report = readJson(jsonPath);
  const requirementName = resolveRequirementName(report);
  const resolvedNotificationUser = resolveNotificationUser(report, options.userEmail);
  const publishName = resolveCodingReportName(requirementName);

  const publishArgs = [
    "--html",
    htmlPath,
    "--name",
    publishName,
    "--type",
    "codereview",
    "--operator",
    resolvedNotificationUser,
  ];
  if (options.tacTimeoutMs) {
    publishArgs.push("--timeout", String(options.tacTimeoutMs));
  }
  if (options.tacBaseUrl) {
    publishArgs.push("--base-url", options.tacBaseUrl);
  }

  const publishPayload = await publishReviewReportToTac(publishArgs);
  const previewUrl = typeof publishPayload.previewUrl === "string" ? publishPayload.previewUrl.trim() : "";

  if (!previewUrl) {
    throw new Error("TAC 上传成功但未返回 previewUrl，无法继续上报 review metric。");
  }

  const metricBaseArgs = buildMetricArgs({ jsonPath, previewUrl, options });
  let metricPayload = null;
  let metricStep = null;

  try {
    const metricArgs = [...metricBaseArgs];
    if (options.metricDryRun) {
      metricArgs.push("--dry-run");
    }

    metricPayload = await reportReviewMetric(metricArgs);
    metricStep = {
      name: "report-review-metric",
      status: "success",
      payload: metricPayload.payload || null,
      response: metricPayload.response || null,
      dryRun: Boolean(metricPayload.dryRun),
    };
  } catch (error) {
    const metricError = error instanceof Error ? error.message : String(error);
    const metricFallbackArgs = [...metricBaseArgs, "--dry-run"];
    metricPayload = await reportReviewMetric(metricFallbackArgs);
    metricStep = {
      name: "report-review-metric",
      status: "failed",
      payload: metricPayload.payload || null,
      response: null,
      dryRun: true,
      error: metricError,
    };
  }

  const qualityScore = metricPayload?.payload?.qualityScore;
  const resolvedGitBranch =
    (metricPayload?.payload?.gitBranch && String(metricPayload.payload.gitBranch).trim()) ||
    options.gitBranch ||
    "";
  const notifyArgs = [
    "--preview-url",
    previewUrl,
    "--quality-score",
    String(qualityScore ?? ""),
  ];
  notifyArgs.push("--review-json", jsonPath);
  if (options.weworkTimeoutMs) {
    notifyArgs.push("--timeout", String(options.weworkTimeoutMs));
  }
  if (options.weworkApiUrl) {
    notifyArgs.push("--api-url", options.weworkApiUrl);
  }

  if (requirementName) {
    notifyArgs.push("--requirement-name", requirementName);
  }

  if (resolvedGitBranch) {
    notifyArgs.push("--git-branch", resolvedGitBranch);
  }

  if (resolvedNotificationUser) {
    notifyArgs.push("--user-email", resolvedNotificationUser);
  }

  if (options.weworkDryRun || options.metricDryRun) {
    notifyArgs.push("--dry-run");
  }

  const notifyPayload = await pushReviewNotificationToWework(notifyArgs);
  const gitlabSyncPayload = syncGitlabYmlFromCiConfig({
    repoRoot: process.cwd(),
  });
  const pipelineResult = {
    reportDir: outputDir,
    htmlPath,
    jsonPath,
    previewUrl,
    metric: {
      payload: metricPayload.payload || null,
      response: metricPayload.response || null,
      dryRun: Boolean(metricPayload.dryRun),
    },
    steps: [
      {
        name: "render-review-report",
        status: "success",
        scriptsDir,
        reportDir: outputDir,
        htmlPath,
        jsonPath,
      },
      {
        name: "publish-review-report-to-tac",
        status: "success",
        previewUrl,
      },
      metricStep,
      {
        name: "push-review-notification-to-wework",
        status: notifyPayload.skipped ? "skipped" : "success",
        user: resolvedNotificationUser || notifyPayload.payload?.users?.[0] || null,
        payload: notifyPayload.payload || null,
        response: notifyPayload.response || null,
        reason: notifyPayload.reason || null,
        dryRun: Boolean(notifyPayload.dryRun),
      },
      {
        name: "sync-gitlab-yml-from-ci-config",
        status: "success",
        mode: gitlabSyncPayload.mode,
        sourcePath: gitlabSyncPayload.sourcePath,
        targetPath: gitlabSyncPayload.targetPath,
      },
    ],
  };

  process.stdout.write(
    `${JSON.stringify(
      pipelineResult,
      null,
      2,
    )}\n`,
  );
  process.stdout.write("\n# review_report_delivery\n");
  process.stdout.write(`reportDir=${outputDir}\n`);
  process.stdout.write(`htmlPath=${htmlPath}\n`);
  process.stdout.write(`jsonPath=${jsonPath}\n`);
  process.stdout.write(`previewUrl=${previewUrl}\n`);
  process.stdout.write(`qualityScore=${metricPayload?.payload?.qualityScore ?? ""}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}
