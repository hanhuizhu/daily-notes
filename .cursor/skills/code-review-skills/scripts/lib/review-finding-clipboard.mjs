function normalizeValue(value, fallback = "-") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeList(value) {
  return Array.isArray(value) && value.length > 0 ? value : ["无额外内容"];
}

function formatLocation(finding) {
  const filePath = normalizeValue(finding?.filePath);
  const line = finding?.endLine && finding.endLine !== finding.line
    ? `${finding.line ?? "-"}-${finding.endLine}`
    : normalizeValue(finding?.line);
  return `${filePath}:${line}`;
}

function formatEvidence(items) {
  return normalizeList(items).map((item) => `- ${normalizeValue(item)}`).join("\n");
}

export function buildFindingClipboardText(finding = {}, findingIndex = 0) {
  const title = normalizeValue(finding.title || finding.problem, "未命名问题");
  const codeSnippet = finding.codeSnippet
    ? `\n\n## 代码片段\n\n\`\`\`\n${finding.codeSnippet}\n\`\`\``
    : "";

  return [
    `# 代码审查问题 ${findingIndex + 1}：${title}`,
    "",
    "## 基本信息",
    "",
    `- 审查维度：${normalizeValue(finding.dimension)}`,
    `- 严重程度：${normalizeValue(finding.severity)}`,
    `- 是否必须修复：${finding.mustFix ? "是" : "否"}`,
    `- 文件位置：${formatLocation(finding)}`,
    "",
    "## 问题描述",
    "",
    normalizeValue(finding.problem),
    "",
    "## 影响风险",
    "",
    normalizeValue(finding.risk),
    "",
    "## 规则依据",
    "",
    normalizeValue(finding.ruleRef),
    "",
    "## 需求依据",
    "",
    normalizeValue(finding.requirementRef),
    "",
    "## 修复建议",
    "",
    normalizeValue(finding.suggestion),
    "",
    "## 问题证据",
    "",
    formatEvidence(finding.evidence),
    codeSnippet,
  ].join("\n");
}

function resetClipboardButton(button, originalText) {
  button.disabled = false;
  button.textContent = originalText;
}

function createClipboardHandler({ button, clipboard, findings }) {
  const originalText = button.textContent;
  let resetTimer = null;
  const scheduleReset = () => {
    resetTimer = setTimeout(() => resetClipboardButton(button, originalText), 1800);
  };

  const handler = async (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (!clipboard || typeof clipboard.writeText !== "function") {
      button.textContent = "不支持复制";
      scheduleReset();
      return;
    }

    const findingIndex = Number(button.dataset.findingIndex);
    const finding = findings?.[findingIndex];
    if (!finding) {
      button.textContent = "复制失败";
      scheduleReset();
      return;
    }

    button.disabled = true;
    button.textContent = "复制中...";

    try {
      await clipboard.writeText(buildFindingClipboardText(finding, findingIndex));
      button.textContent = "已复制";
    } catch {
      button.textContent = "复制失败";
    } finally {
      button.disabled = false;
      scheduleReset();
    }
  };

  return { handler, getResetTimer: () => resetTimer };
}

export function installFindingClipboardInteractions({ document, navigator, findings }) {
  const buttons = Array.from(document.querySelectorAll(".copy-finding-button"));
  const clipboard = navigator?.clipboard;

  if (!buttons.length) {
    return { destroy() {} };
  }

  const buttonHandlers = buttons.map((button) => {
    const { handler, getResetTimer } = createClipboardHandler({ button, clipboard, findings });
    button.addEventListener("click", handler);
    return { button, handler, getResetTimer };
  });

  return {
    destroy() {
      buttonHandlers.forEach(({ button, handler, getResetTimer }) => {
        button.removeEventListener("click", handler);
        const resetTimer = getResetTimer();
        if (resetTimer) {
          clearTimeout(resetTimer);
        }
      });
    },
  };
}

export function renderFindingClipboardClientScript(findings) {
  const serializedFindings = JSON.stringify(findings).replace(/</g, "\\u003c");

  return [
    "<script>",
    `const REVIEW_FINDINGS_FOR_CLIPBOARD = ${serializedFindings};`,
    normalizeValue.toString(),
    normalizeList.toString(),
    formatLocation.toString(),
    formatEvidence.toString(),
    buildFindingClipboardText.toString(),
    resetClipboardButton.toString(),
    createClipboardHandler.toString(),
    installFindingClipboardInteractions.toString(),
    "installFindingClipboardInteractions({",
    "  document: window.document,",
    "  navigator: window.navigator,",
    "  findings: REVIEW_FINDINGS_FOR_CLIPBOARD,",
    "});",
    "</script>",
  ].join("\n");
}
