#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeScore } from "./lib/review-score.mjs";
import { renderFalsePositiveClientScript } from "./lib/review-false-positive.mjs";
import { renderFindingClipboardClientScript } from "./lib/review-finding-clipboard.mjs";

const DIMENSIONS = [
  "业务功能的实现",
  "代码的质量",
  "架构的合理性",
  "项目 rules 的遵循情况",
];

const SEVERITY_LABELS = {
  S1: "阻断",
  S2: "高",
  S3: "中",
  S4: "低",
};

function parseArgs(argv) {
  const options = {
    input: "",
    output: "",
    outputDir: "",
    title: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--input" && argv[index + 1]) {
      options.input = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--output" && argv[index + 1]) {
      options.output = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--output-dir" && argv[index + 1]) {
      options.outputDir = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--title" && argv[index + 1]) {
      options.title = argv[index + 1];
      index += 1;
    }
  }

  if (!options.input) {
    throw new Error("Missing required --input <json>");
  }

  return options;
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeMeta(meta = {}, overrideTitle = "") {
  const inputContext = meta.inputContext && typeof meta.inputContext === "object" ? meta.inputContext : {};

  return {
    title: overrideTitle || meta.title || "代码审查报告",
    reviewScope: meta.reviewScope || "-",
    branch: meta.branch || "-",
    generatedAt: formatBeijingTime(meta.generatedAt),
    reviewer: meta.reviewer || "Codex",
    reviewedFiles: ensureArray(meta.reviewedFiles),
    businessChecks: ensureArray(meta.businessChecks),
    codeQualityRiskTips: ensureArray(meta.codeQualityRiskTips),
    inputContext: {
      inputType: inputContext.inputType || "-",
      sourceLabel: inputContext.sourceLabel || "-",
      sourceUrl: inputContext.sourceUrl || "",
      requirementSummary: inputContext.requirementSummary || "-",
      taskDescription: inputContext.taskDescription || "-",
      acceptanceHints: ensureArray(inputContext.acceptanceHints),
    },
  };
}

function formatBeijingTime(value) {
  const date = value ? new Date(value) : new Date();

  if (Number.isNaN(date.getTime())) {
    return String(value || "-");
  }

  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date).replace(/\//g, "-");
}

function normalizeReady(value) {
  const raw = String(value || "").trim();
  const mapping = {
    Yes: "可直接合入",
    No: "不可合入",
    "With fixes": "需修复后再合入",
  };

  return mapping[raw] || raw || "-";
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

function resolveOutputPaths(options) {
  if (options.output) {
    const htmlPath = path.resolve(options.output);
    return {
      reportDir: path.dirname(htmlPath),
      htmlPath,
      jsonPath: path.join(path.dirname(htmlPath), "review-findings.json"),
    };
  }

  const reportDir = options.outputDir
    ? path.resolve(options.outputDir)
    : path.resolve(process.cwd(), "docs", "superpowers", "reports", buildTimestampDirName());

  return {
    reportDir,
    htmlPath: path.join(reportDir, "review-report.html"),
    jsonPath: path.join(reportDir, "review-findings.json"),
  };
}

function groupFindings(findings) {
  const grouped = new Map(DIMENSIONS.map((name) => [name, []]));

  findings.forEach((finding, findingIndex) => {
    const dimension = DIMENSIONS.includes(finding.dimension) ? finding.dimension : "代码的质量";
    grouped.get(dimension).push({ finding, findingIndex });
  });

  return grouped;
}

function renderMetricCard(label, value, tone = "neutral") {
  return `
    <div class="metric-card ${tone}">
      <div class="metric-label">${escapeHtml(label)}</div>
      <div class="metric-value">${escapeHtml(value)}</div>
    </div>
  `;
}

function renderTextList(items, className = "plain-list") {
  if (!items.length) {
    return `<div class="empty-state">审查结果无偏差</div>`;
  }

  return `<ul class="${className}">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderBusinessChecks(checks) {
  if (!checks.length) {
    return `<div class="empty-state">审查结果无偏差</div>`;
  }

  return `
    <div class="business-checks">
      ${checks
        .map((item) => {
          const passed = Boolean(item.passed);
          const icon = passed ? "✓" : "✗";
          const status = passed ? "已实现" : "未实现";
          const requirementRef = item.requirementRef
            ? `<div class="business-check-ref"><strong>对应需求：</strong>${escapeHtml(item.requirementRef)}</div>`
            : "";

          return `
            <div class="business-check ${passed ? "passed" : "failed"}">
              <div class="business-check-head">
                <span class="business-check-icon">${icon}</span>
                <span class="business-check-feature">${escapeHtml(item.feature || "未命名功能点")}</span>
                <span class="business-check-status">${status}</span>
              </div>
              <div class="business-check-detail">${escapeHtml(item.detail || "-")}</div>
              ${requirementRef}
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderEvidenceList(items) {
  if (!items.length) {
    return `<li>无额外证据</li>`;
  }

  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function renderFinding(finding, findingIndex, shouldOpen) {
  const lineSuffix =
    finding.endLine && finding.endLine !== finding.line
      ? `${finding.line}-${finding.endLine}`
      : `${finding.line ?? "-"}`;
  const severity = typeof finding.severity === "string" ? finding.severity : "S4";
  const codeSnippet = finding.codeSnippet ? escapeHtml(finding.codeSnippet) : "";
  const ruleRef = finding.ruleRef ? `<div><strong>规则依据：</strong>${escapeHtml(finding.ruleRef)}</div>` : "";
  const requirementRef = finding.requirementRef
    ? `<div><strong>需求依据：</strong>${escapeHtml(finding.requirementRef)}</div>`
    : "";
  const suggestion = finding.suggestion ? `<div><strong>修复建议：</strong>${escapeHtml(finding.suggestion)}</div>` : "";
  const evidence = renderEvidenceList(ensureArray(finding.evidence));

  return `
    <details class="finding-card" ${shouldOpen ? "open" : ""}>
      <summary>
        <span class="finding-badges">
          <span class="badge severity">${escapeHtml(SEVERITY_LABELS[severity] || severity)}</span>
          <span class="badge must-fix ${finding.mustFix ? "is-true" : "is-false"}">${finding.mustFix ? "必须修复" : "建议修复"}</span>
        </span>
        <span class="finding-title-group">
          <span class="finding-title">${escapeHtml(finding.title || finding.problem || "未命名问题")}</span>
          <span class="false-positive-status" hidden></span>
          <button
            type="button"
            class="copy-finding-button"
            data-finding-index="${findingIndex}"
            aria-label="复制问题 ${findingIndex + 1}"
          >复制问题</button>
          <button
            type="button"
            class="false-positive-button"
            data-finding-index="${findingIndex}"
            data-is-false-positive="false"
            aria-label="将问题 ${findingIndex + 1} 标记为误报"
          >误报</button>
        </span>
        <span class="finding-location">${escapeHtml(finding.filePath || "-")}:${escapeHtml(lineSuffix)}</span>
      </summary>
      <div class="finding-body">
        <div><strong>问题描述：</strong>${escapeHtml(finding.problem || "-")}</div>
        <div><strong>影响风险：</strong>${escapeHtml(finding.risk || "-")}</div>
        ${ruleRef}
        ${requirementRef}
        ${suggestion}
        <div class="section-label">问题证据</div>
        <ul>${evidence}</ul>
        ${
          codeSnippet
            ? `<div class="section-label">代码片段</div><pre><code>${codeSnippet}</code></pre>`
            : ""
        }
      </div>
    </details>
  `;
}

function renderCodeQualityRiskTips(items) {
  if (!items.length) {
    return "";
  }

  return `
    <div class="advisory-list">
      ${items
        .map(
          (item) => `
            <div class="advisory-card">
              <div class="advisory-head">
                <span class="badge advisory">风险提示</span>
              </div>
              <div class="advisory-body">${escapeHtml(item)}</div>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderDimensionSection(name, findings, options = {}) {
  const advisoryHtml = options.advisoryHtml || "";
  const body =
    findings.length === 0
      ? `<div class="empty-state">审查结果无偏差</div>`
      : findings
          .map(({ finding, findingIndex }, index) => renderFinding(finding, findingIndex, index === 0))
          .join("");

  return `
    <section class="dimension-section">
      <h2>${escapeHtml(name)}</h2>
      ${advisoryHtml}
      ${body}
    </section>
  `;
}

function renderQuestionList(questions) {
  if (questions.length === 0) {
    return `<div class="empty-state">审查结果无偏差</div>`;
  }

  return `
    <ul class="question-list">
      ${questions
        .map(
          (item) =>
            `<li><strong>${escapeHtml(item.title || "待确认问题")}：</strong>${escapeHtml(item.detail || "-")}</li>`,
        )
        .join("")}
    </ul>
  `;
}

function renderHtml(report, outputTitle) {
  const findings = ensureArray(report.findings);
  const questions = ensureArray(report.questions);
  const summary = report.summary && typeof report.summary === "object" ? report.summary : {};
  const meta = normalizeMeta(report.meta, outputTitle);
  const score = computeScore(findings);
  const grouped = groupFindings(findings);
  const readyLabel = normalizeReady(summary.ready);

  const dimensionSections = DIMENSIONS.map((name) =>
    renderDimensionSection(name, grouped.get(name) || [], {
      advisoryHtml: name === "代码的质量" ? renderCodeQualityRiskTips(meta.codeQualityRiskTips) : "",
    }),
  ).join("");
  const acceptanceHints = renderTextList(meta.inputContext.acceptanceHints);
  const reviewedFiles = renderTextList(meta.reviewedFiles, "file-list");
  const businessChecks = renderBusinessChecks(meta.businessChecks);

  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(meta.title)}</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4f7fb;
        --surface: #ffffff;
        --surface-alt: #f7f9fc;
        --surface-deep: #eef3f9;
        --text: #1f2d3d;
        --muted: #5b6b7c;
        --line: #d7e0ea;
        --accent: #2f6feb;
        --accent-soft: #eaf1ff;
        --danger: #d63c3c;
        --danger-soft: #fff0f0;
        --warn: #c9811a;
        --warn-soft: #fff5e8;
        --ok: #1f8f5f;
        --ok-soft: #ecfbf4;
        --ink: #0f172a;
        --code-bg: #0f172a;
        --code-head: #111c31;
        --code-line: rgba(148, 163, 184, 0.14);
        --code-accent: #7dd3fc;
        --code-text: #e5eefb;
        --shadow: 0 14px 34px rgba(15, 23, 42, 0.08);
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        font-family: "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif;
        background:
          linear-gradient(180deg, #f8fbff 0%, var(--bg) 100%);
        color: var(--text);
      }

      .page {
        max-width: 1240px;
        margin: 0 auto;
        padding: 32px 20px 64px;
      }

      .hero,
      .panel,
      .dimension-section,
      .summary-panel {
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 18px;
        box-shadow: var(--shadow);
      }

      .hero {
        padding: 30px 32px;
        border-top: 5px solid var(--accent);
      }

      .hero h1 {
        margin: 0;
        font-size: 34px;
        line-height: 1.2;
        color: var(--ink);
      }

      .hero-subtitle {
        margin-top: 10px;
        color: var(--muted);
        font-size: 15px;
      }

      .hero-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 14px;
        margin-top: 24px;
      }

      .meta-item {
        padding: 16px 18px;
        background: var(--surface-alt);
        border-radius: 14px;
        border: 1px solid var(--line);
      }

      .meta-label,
      .metric-label,
      .section-label {
        color: var(--muted);
        font-size: 12px;
        letter-spacing: 0.04em;
        font-weight: 600;
      }

      .meta-value {
        margin-top: 6px;
        font-size: 15px;
        line-height: 1.5;
        word-break: break-word;
        color: var(--ink);
      }

      .summary-row {
        display: grid;
        grid-template-columns: 1.2fr 1fr;
        gap: 18px;
        margin-top: 20px;
      }

      .summary-panel {
        padding: 22px 24px;
      }

      .summary-panel h2,
      .panel h2,
      .dimension-section h2 {
        margin: 0 0 16px;
        font-size: 22px;
        color: var(--ink);
      }

      .panel {
        padding: 24px;
        margin-top: 20px;
      }

      .meta-matrix,
      .score-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 14px;
      }

      .metric-strip {
        margin-top: 18px;
      }

      .metric-card {
        padding: 18px;
        border-radius: 16px;
        background: linear-gradient(180deg, #ffffff 0%, var(--surface-alt) 100%);
        border: 1px solid var(--line);
      }

      .metric-card.positive {
        background: var(--ok-soft);
        border-color: rgba(31, 143, 95, 0.2);
      }

      .metric-card.danger {
        background: var(--danger-soft);
        border-color: rgba(214, 60, 60, 0.2);
      }

      .metric-card.warning {
        background: var(--warn-soft);
        border-color: rgba(201, 129, 26, 0.2);
      }

      .metric-value {
        margin-top: 8px;
        font-size: 30px;
        font-weight: 700;
        color: var(--ink);
      }

      .summary-text {
        line-height: 1.7;
        white-space: pre-wrap;
      }

      .dimension-section {
        padding: 24px;
        margin-top: 20px;
      }

      .section-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px;
      }

      .section-block {
        padding: 16px 18px;
        background: var(--surface-alt);
        border: 1px solid var(--line);
        border-radius: 14px;
      }

      .finding-card {
        border: 1px solid var(--line);
        border-radius: 16px;
        background: var(--surface);
        overflow: hidden;
        box-shadow: 0 8px 20px rgba(15, 23, 42, 0.04);
      }

      .finding-card + .finding-card {
        margin-top: 14px;
      }

      .finding-card summary {
        list-style: none;
        cursor: pointer;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        gap: 12px;
        align-items: center;
        padding: 18px 20px;
        background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
      }

      .finding-card summary::-webkit-details-marker {
        display: none;
      }

      .finding-badges {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 5px 10px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 600;
      }

      .badge.severity {
        background: var(--accent-soft);
        color: var(--accent);
      }

      .badge.must-fix.is-true {
        background: var(--danger-soft);
        color: var(--danger);
      }

      .badge.must-fix.is-false {
        background: #edf2f7;
        color: var(--muted);
      }

      .badge.advisory {
        background: var(--warn-soft);
        color: var(--warn);
      }

      .finding-title {
        font-weight: 700;
        line-height: 1.5;
        color: var(--ink);
      }

      .finding-title-group {
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }

      .false-positive-button {
        flex: none;
        border: 1px solid rgba(214, 60, 60, 0.45);
        border-radius: 999px;
        padding: 5px 11px;
        background: #ffffff;
        color: var(--danger);
        font: inherit;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
      }

      .copy-finding-button {
        flex: none;
        border: 1px solid rgba(47, 111, 235, 0.45);
        border-radius: 999px;
        padding: 5px 11px;
        background: #ffffff;
        color: var(--accent);
        font: inherit;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
      }

      .copy-finding-button:hover {
        background: var(--accent-soft);
      }

      .copy-finding-button:disabled {
        cursor: wait;
        opacity: 0.65;
      }

      .false-positive-button:hover {
        background: var(--danger-soft);
      }

      .false-positive-button:disabled {
        cursor: wait;
        opacity: 0.65;
      }

      .false-positive-status {
        flex: none;
        border-radius: 999px;
        padding: 5px 10px;
        background: var(--danger-soft);
        color: var(--danger);
        font-size: 12px;
        font-weight: 700;
      }

      .false-positive-status[hidden] {
        display: none;
      }

      .finding-location {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 12px;
        color: var(--muted);
        text-align: right;
      }

      .finding-body {
        padding: 0 20px 20px;
        line-height: 1.7;
      }

      .finding-body > div + div {
        margin-top: 8px;
      }

      .advisory-list {
        display: grid;
        gap: 12px;
        margin-bottom: 14px;
      }

      .advisory-card {
        padding: 16px 18px;
        border-radius: 14px;
        border: 1px solid rgba(201, 129, 26, 0.24);
        background: linear-gradient(180deg, #fffdf7 0%, var(--warn-soft) 100%);
      }

      .advisory-head {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .advisory-body {
        margin-top: 10px;
        line-height: 1.7;
        color: var(--ink);
      }

      .business-checks {
        display: grid;
        gap: 12px;
      }

      .business-check {
        padding: 16px 18px;
        border-radius: 14px;
        border: 1px solid var(--line);
        background: var(--surface-alt);
      }

      .business-check.passed {
        background: linear-gradient(180deg, #ffffff 0%, var(--ok-soft) 100%);
        border-color: rgba(31, 143, 95, 0.22);
      }

      .business-check.failed {
        background: linear-gradient(180deg, #ffffff 0%, var(--danger-soft) 100%);
        border-color: rgba(214, 60, 60, 0.22);
      }

      .business-check-head {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }

      .business-check-icon {
        width: 24px;
        height: 24px;
        border-radius: 999px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        font-size: 14px;
        background: rgba(255, 255, 255, 0.9);
        border: 1px solid currentColor;
      }

      .business-check-feature {
        font-weight: 700;
        color: var(--ink);
      }

      .business-check-status {
        margin-left: auto;
        font-size: 13px;
        font-weight: 700;
        color: var(--muted);
      }

      .business-check-detail,
      .business-check-ref {
        margin-top: 8px;
        line-height: 1.7;
      }

      ul {
        margin: 8px 0 0;
        padding-left: 20px;
      }

      .plain-list,
      .file-list,
      .question-list {
        margin: 0;
      }

      .file-list li {
        padding: 10px 12px;
        border-radius: 10px;
        background: var(--surface-alt);
        border: 1px solid var(--line);
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 13px;
        color: var(--ink);
      }

      .file-list li + li {
        margin-top: 8px;
      }

      pre {
        margin: 10px 0 0;
        padding: 0;
        overflow-x: auto;
        border-radius: 14px;
        background:
          linear-gradient(180deg, var(--code-head) 0 44px, var(--code-bg) 44px 100%);
        color: var(--code-text);
        border: 1px solid rgba(148, 163, 184, 0.24);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
      }

      code {
        display: block;
        position: relative;
        padding: 58px 18px 18px;
        line-height: 1.7;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 13px;
        white-space: pre;
        background-image: linear-gradient(transparent 31px, var(--code-line) 32px);
        background-size: 100% 32px;
      }

      code::before {
        content: "代码片段";
        position: absolute;
        top: 14px;
        left: 18px;
        color: var(--code-accent);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
      }

      code::after {
        content: "";
        position: absolute;
        top: 22px;
        right: 18px;
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: #fb7185;
        box-shadow: -18px 0 0 #fbbf24, -36px 0 0 #34d399;
      }

      .empty-state {
        padding: 12px 14px;
        border-radius: 12px;
        background: var(--surface-alt);
        color: var(--muted);
        border: 1px dashed var(--line);
      }

      .false-positive-modal {
        position: fixed;
        inset: 0;
        z-index: 1000;
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding: 15vh 16px 24px;
        background: rgba(15, 23, 42, 0.48);
        backdrop-filter: blur(3px);
      }

      .false-positive-modal[hidden] {
        display: none;
      }

      .false-positive-dialog {
        width: min(520px, 100%);
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 24px;
        background: var(--surface);
        box-shadow: 0 24px 70px rgba(15, 23, 42, 0.24);
      }

      .false-positive-dialog h3 {
        margin: 0;
        color: var(--ink);
        font-size: 20px;
      }

      .false-positive-dialog label {
        display: block;
        margin-top: 18px;
        color: var(--ink);
        font-size: 14px;
        font-weight: 700;
      }

      .false-positive-dialog textarea {
        width: 100%;
        min-height: 112px;
        margin-top: 8px;
        resize: vertical;
        border: 1px solid var(--line);
        border-radius: 12px;
        padding: 12px 14px;
        color: var(--ink);
        font: inherit;
        line-height: 1.6;
        outline: none;
      }

      .false-positive-dialog textarea:focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-soft);
      }

      .false-positive-dialog-meta {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        margin-top: 8px;
        color: var(--muted);
        font-size: 12px;
      }

      .false-positive-error {
        min-height: 18px;
        color: var(--danger);
      }

      .false-positive-dialog-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 20px;
      }

      .false-positive-dialog-actions button {
        border: 1px solid var(--line);
        border-radius: 10px;
        padding: 9px 16px;
        background: var(--surface);
        color: var(--ink);
        font: inherit;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
      }

      .false-positive-dialog-actions button[data-action="submit-false-positive"] {
        border-color: var(--danger);
        background: var(--danger);
        color: #ffffff;
      }

      .false-positive-dialog-actions button:disabled {
        cursor: wait;
        opacity: 0.65;
      }

      .footer {
        margin-top: 24px;
        color: var(--muted);
        font-size: 13px;
        text-align: center;
      }

      a {
        color: var(--accent);
        text-decoration: none;
      }

      a:hover {
        text-decoration: underline;
      }

      @media (max-width: 980px) {
        .hero-grid,
        .meta-matrix,
        .score-grid,
        .section-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .summary-row {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 720px) {
        .hero-grid,
        .meta-matrix,
        .score-grid,
        .section-grid {
          grid-template-columns: 1fr;
        }

        .finding-card summary {
          grid-template-columns: 1fr;
        }

        .finding-location {
          text-align: left;
        }
      }
    </style>
  </head>
  <body>
    <div class="page">
      <section class="hero">
        <h1>${escapeHtml(meta.title)}</h1>
        <div class="hero-subtitle">结构化代码审查报告</div>
        <div class="hero-grid">
          <div class="meta-item">
            <div class="meta-label">审查范围</div>
            <div class="meta-value">${escapeHtml(meta.reviewScope)}</div>
          </div>
          <div class="meta-item">
            <div class="meta-label">分支名称</div>
            <div class="meta-value">${escapeHtml(meta.branch)}</div>
          </div>
          <div class="meta-item">
            <div class="meta-label">生成时间</div>
            <div class="meta-value">${escapeHtml(meta.generatedAt)}</div>
          </div>
          <div class="meta-item">
            <div class="meta-label">审查者</div>
            <div class="meta-value">${escapeHtml(meta.reviewer)}</div>
          </div>
        </div>
      </section>

      <div class="summary-row">
        <section class="summary-panel">
          <h2>审查结论</h2>
          <div class="section-grid">
            <div class="section-block">
              <div class="section-label">结论状态</div>
              <div class="meta-value">${escapeHtml(readyLabel)}</div>
            </div>
            <div class="section-block">
              <div class="section-label">风险等级</div>
              <div class="meta-value">${escapeHtml(score.riskLevel)}</div>
            </div>
          </div>
          <div class="section-label" style="margin-top:16px;">结论说明</div>
          <div class="summary-text">${escapeHtml(summary.reasoning || "无补充说明")}</div>
        </section>

        <section class="summary-panel">
          <h2>评分与分布</h2>
          <div class="score-grid">
            ${renderMetricCard("总分", `${score.score}`, score.score >= 90 ? "positive" : score.score < 75 ? "danger" : "warning")}
            ${renderMetricCard("必须修复问题", `${score.mustFixCount}`, score.mustFixCount > 0 ? "danger" : "positive")}
            ${renderMetricCard("阻断问题数", `${score.severityCounts.S1 || 0}`, score.severityCounts.S1 ? "danger" : "neutral")}
            ${renderMetricCard("高风险问题数", `${score.severityCounts.S2 || 0}`, score.severityCounts.S2 ? "warning" : "neutral")}
          </div>
          <div class="score-grid metric-strip">
            ${renderMetricCard("中风险问题数", `${score.severityCounts.S3 || 0}`)}
            ${renderMetricCard("低风险问题数", `${score.severityCounts.S4 || 0}`)}
            ${renderMetricCard("审查文件数", `${meta.reviewedFiles.length}`)}
            ${renderMetricCard("需求来源", `${meta.inputContext.inputType}`)}
          </div>
        </section>
      </div>

      <section class="panel">
        <h2>需求上下文</h2>
        <div class="meta-matrix">
          <div class="meta-item">
            <div class="meta-label">输入类型</div>
            <div class="meta-value">${escapeHtml(meta.inputContext.inputType)}</div>
          </div>
          <div class="meta-item">
            <div class="meta-label">来源标题</div>
            <div class="meta-value">${escapeHtml(meta.inputContext.sourceLabel)}</div>
          </div>
          <div class="meta-item">
            <div class="meta-label">来源地址</div>
            <div class="meta-value">${
              meta.inputContext.sourceUrl
                ? `<a href="${escapeHtml(meta.inputContext.sourceUrl)}">${escapeHtml(meta.inputContext.sourceUrl)}</a>`
                : "-"
            }</div>
          </div>
          <div class="meta-item">
            <div class="meta-label">审查文件数</div>
            <div class="meta-value">${escapeHtml(String(meta.reviewedFiles.length))}</div>
          </div>
        </div>
        <div class="section-label" style="margin-top:16px;">需求摘要</div>
        <div class="summary-text">${escapeHtml(meta.inputContext.requirementSummary)}</div>
        <div class="section-label" style="margin-top:16px;">任务描述</div>
        <div class="summary-text">${escapeHtml(meta.inputContext.taskDescription)}</div>
        <div class="section-label" style="margin-top:16px;">验收提示</div>
        ${acceptanceHints}
      </section>

      <section class="panel">
        <h2>已审查文件清单</h2>
        ${reviewedFiles}
      </section>

      <section class="panel">
        <h2>业务功能点核对</h2>
        ${businessChecks}
      </section>

      ${dimensionSections}

      <section class="panel">
        <h2>待确认问题</h2>
        ${renderQuestionList(questions)}
      </section>

      <div class="footer">本报告由 .cursor/skills/code-review-skills/scripts/render-review-report.mjs 基于结构化 findings 自动生成。</div>
    </div>
    <div class="false-positive-modal" hidden>
      <div
        class="false-positive-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="false-positive-title"
      >
        <h3 id="false-positive-title">标记为误报</h3>
        <label for="false-positive-reason">误报原因</label>
        <textarea
          id="false-positive-reason"
          data-role="false-positive-reason"
          placeholder="请输入误报原因，最多100个字符"
        ></textarea>
        <div class="false-positive-dialog-meta">
          <div class="false-positive-error" data-role="false-positive-error" aria-live="polite"></div>
          <div><span data-role="false-positive-count">0</span>/100</div>
        </div>
        <div class="false-positive-dialog-actions">
          <button type="button" data-action="cancel-false-positive">取消</button>
          <button type="button" data-action="submit-false-positive">确认误报</button>
        </div>
      </div>
    </div>
    ${renderFalsePositiveClientScript()}
    ${renderFindingClipboardClientScript(findings)}
  </body>
</html>`;
}

export function generateReviewReport(rawOptions) {
  const options =
    Array.isArray(rawOptions) ? parseArgs(rawOptions) : { ...parseArgs(["--input", "placeholder"]), ...rawOptions };
  const inputPath = path.resolve(options.input);
  const report = readJson(inputPath);
  const html = renderHtml(report, options.title);
  const outputPaths = resolveOutputPaths(options);

  fs.mkdirSync(outputPaths.reportDir, { recursive: true });
  fs.writeFileSync(outputPaths.htmlPath, html, "utf8");
  fs.copyFileSync(inputPath, outputPaths.jsonPath);
  return outputPaths;
}

function main() {
  const outputPaths = generateReviewReport(process.argv.slice(2));
  process.stdout.write(`${outputPaths.reportDir}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
}
