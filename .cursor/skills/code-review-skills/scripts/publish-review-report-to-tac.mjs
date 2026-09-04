#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeRecipientEmail } from "./lib/review-recipient.mjs";

const TYPES = new Set(["coding", "bugfix", "codereview", "jserrorFix", "coding-plan"]);
const DEFAULT_BASE_URL = "https://tac-gateway.tuhuyun.cn";
const DEFAULT_ORIGIN = "https://tac.tuhuyun.cn";
const DEFAULT_OPERATOR = "luoxiao3@tuhu.cn";
const DEFAULT_TIMEOUT_MS = Number(
  process.env.TAC_CODING_REPORT_TIMEOUT || process.env.TAC_ADD_PREVIEW_TIMEOUT || 120000,
);
const AUTH_CODE = "ac_feQD6jdWvS6nmgy-DO6hsdI_pgMSypCZ";

function parseArgs(argv) {
  const options = {
    html: "",
    name: "代码审查报告",
    type: "codereview",
    operator: DEFAULT_OPERATOR,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    baseUrl: process.env.TAC_BASE_URL || DEFAULT_BASE_URL,
    origin: process.env.TAC_ORIGIN || DEFAULT_ORIGIN,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--html" && argv[index + 1]) {
      options.html = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--name" && argv[index + 1]) {
      options.name = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--type" && argv[index + 1]) {
      options.type = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--operator" && argv[index + 1]) {
      options.operator = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--timeout" && argv[index + 1]) {
      options.timeoutMs = Number(argv[index + 1]) || DEFAULT_TIMEOUT_MS;
      index += 1;
      continue;
    }

    if (arg === "--base-url" && argv[index + 1]) {
      options.baseUrl = argv[index + 1];
      index += 1;
      continue;
    }

    if (!arg.startsWith("-") && !options.html) {
      options.html = arg;
    }
  }

  return options;
}

function normalizeOptions(rawOptions) {
  if (Array.isArray(rawOptions)) {
    return parseArgs(rawOptions);
  }

  return {
    ...parseArgs([]),
    ...rawOptions,
  };
}

export function resolveCodingReportName(rawName) {
  const name = typeof rawName === "string" ? rawName.trim() : "";
  return (name || "代码审查报告").slice(0, 50);
}

export function normalizeCodingReportOperator(rawOperator) {
  return normalizeRecipientEmail(rawOperator) || DEFAULT_OPERATOR;
}

function validateOptions(options) {
  const name = typeof options.name === "string" ? options.name.trim() : "";
  const type = typeof options.type === "string" ? options.type.trim() : "";
  const operator = normalizeCodingReportOperator(options.operator);

  if (!options.html) {
    throw new Error("Missing required --html <path>");
  }

  if (!name) {
    throw new Error("--name 不能为空");
  }

  if (name.length > 50) {
    throw new Error("--name 不能超过 50 个字符");
  }

  if (!TYPES.has(type)) {
    throw new Error(`--type 必须是 ${[...TYPES].join(", ")}`);
  }

  if (!operator || !/^\S+@\S+\.\S+$/.test(operator)) {
    throw new Error("--operator 必须是完整邮箱地址");
  }

  if (!AUTH_CODE.trim()) {
    throw new Error("publish-review-report-to-tac.mjs 未配置 authCode");
  }

  return {
    ...options,
    name,
    type,
    operator,
  };
}

async function publishHtml({ htmlPath, name, type, operator, timeoutMs, baseUrl, origin }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const content = fs.readFileSync(htmlPath, "utf8");

    if (!content) {
      throw new Error("HTML content 不能为空");
    }

    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/coding/report/publish`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        "x-auth-code": AUTH_CODE.trim(),
      },
      body: JSON.stringify({ name, content, type, operator }),
      signal: controller.signal,
    });

    const rawText = await response.text();
    let payload;

    try {
      payload = JSON.parse(rawText);
    } catch {
      payload = { code: response.status, message: rawText };
    }

    if (!response.ok) {
      throw new Error(`TAC Coding 报告发布失败，HTTP ${response.status}：${JSON.stringify(payload)}`);
    }

    if (!payload || typeof payload !== "object" || payload.code !== 10000) {
      throw new Error(`TAC Coding 报告发布失败，业务状态码 ${payload?.code ?? "未知"}：${JSON.stringify(payload)}`);
    }

    return payload;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`TAC Coding 报告发布超时，超过 ${timeoutMs}ms。`);
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function publishReviewReportToTac(rawOptions) {
  const options = validateOptions(normalizeOptions(rawOptions));
  const htmlPath = path.resolve(options.html);

  if (!fs.existsSync(htmlPath) || !fs.statSync(htmlPath).isFile()) {
    throw new Error(`找不到 HTML 文件：${htmlPath}`);
  }

  const response = await publishHtml({
    htmlPath,
    name: options.name,
    type: options.type,
    operator: options.operator,
    timeoutMs: options.timeoutMs,
    baseUrl: options.baseUrl,
    origin: options.origin,
  });
  const dataUrl =
    response.data && typeof response.data === "object" && typeof response.data.url === "string"
      ? response.data.url.trim()
      : "";
  const rootUrl = typeof response.url === "string" ? response.url.trim() : "";
  const previewUrl = dataUrl || rootUrl;

  return {
    htmlPath,
    publishApiMode: "coding-report-publish",
    previewUrl: previewUrl || null,
    tacPreviewShareUrls: previewUrl ? [previewUrl] : [],
    codingReportResponse: response,
  };
}

async function main() {
  const result = await publishReviewReportToTac(process.argv.slice(2));
  const previewUrl = result.previewUrl ? String(result.previewUrl).trim() : "";

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

  if (!previewUrl) {
    process.stdout.write("\n# no_preview_url\n");
    process.exit(1);
  }

  process.stdout.write("\n# tac_preview_share_urls\n");
  process.stdout.write(`${previewUrl}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}
