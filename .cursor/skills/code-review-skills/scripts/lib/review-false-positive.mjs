export const DEFAULT_FALSE_POSITIVE_API_URL =
  "https://office-gateway.tuhuyun.cn/cl-dfe-asset-manage/inner-office/ai-metric/requirements/review-report/false-positive";

export function countUnicodeCharacters(value) {
  return Array.from(String(value ?? "")).length;
}

export function buildFalsePositivePayload({
  isFalsePositive,
  falsePositiveReason,
  findingIndex,
  crReportUrl,
}) {
  if (typeof isFalsePositive !== "boolean") {
    throw new Error("是否误报必须是布尔值");
  }

  if (!Number.isInteger(findingIndex) || findingIndex < 0) {
    throw new Error("问题下标必须是从0开始的整数");
  }

  if (!/^https?:\/\//.test(String(crReportUrl || ""))) {
    throw new Error("当前报告地址无效");
  }

  const reason = String(falsePositiveReason ?? "").trim();
  if (isFalsePositive && !reason) {
    throw new Error("标记误报时必须填写误报原因");
  }

  if (isFalsePositive && countUnicodeCharacters(reason) > 100) {
    throw new Error("误报原因不能超过100个字符");
  }

  return {
    isFalsePositive,
    falsePositiveReason: isFalsePositive ? reason : null,
    findingIndex,
    crReportUrl: String(crReportUrl),
  };
}

export function installFalsePositiveInteractions({
  document,
  location,
  fetchImpl,
  apiUrl = DEFAULT_FALSE_POSITIVE_API_URL,
}) {
  const modal = document.querySelector(".false-positive-modal");
  const reasonInput = modal?.querySelector('[data-role="false-positive-reason"]');
  const countLabel = modal?.querySelector('[data-role="false-positive-count"]');
  const modalError = modal?.querySelector('[data-role="false-positive-error"]');
  const submitButton = modal?.querySelector('[data-action="submit-false-positive"]');
  const cancelButton = modal?.querySelector('[data-action="cancel-false-positive"]');
  const buttons = Array.from(document.querySelectorAll(".false-positive-button"));
  let activeButton = null;

  if (!modal || !reasonInput || !countLabel || !modalError || !submitButton || !cancelButton) {
    return { destroy() {} };
  }

  function resolveStatus(button) {
    return button.closest(".finding-title-group")?.querySelector(".false-positive-status");
  }

  function setButtonState(button, isFalsePositive, reason = "") {
    const status = resolveStatus(button);
    button.dataset.isFalsePositive = String(isFalsePositive);
    button.textContent = isFalsePositive ? "取消误报" : "误报";
    if (status) {
      status.hidden = !isFalsePositive;
      status.textContent = isFalsePositive ? "已标记误报" : "";
      status.title = isFalsePositive ? reason : "";
    }
  }

  function setButtonError(button, message) {
    const status = resolveStatus(button);
    if (status) {
      status.hidden = false;
      status.textContent = message;
      status.title = message;
    }
  }

  function closeModal() {
    modal.hidden = true;
    modalError.textContent = "";
    activeButton = null;
  }

  function openModal(button) {
    activeButton = button;
    reasonInput.value = "";
    countLabel.textContent = "0";
    modalError.textContent = "";
    modal.hidden = false;
    reasonInput.focus();
  }

  async function submitUpdate(button, isFalsePositive, falsePositiveReason) {
    const previousButtonText = button.textContent;
    const previousSubmitText = submitButton.textContent;
    button.disabled = true;
    button.textContent = "提交中...";
    submitButton.disabled = true;
    submitButton.textContent = "提交中...";

    try {
      const payload = buildFalsePositivePayload({
        isFalsePositive,
        falsePositiveReason,
        findingIndex: Number(button.dataset.findingIndex),
        crReportUrl: location.href,
      });
      const response = await fetchImpl(apiUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const rawText = await response.text();
      let result = null;

      if (rawText) {
        try {
          result = JSON.parse(rawText);
        } catch {
          throw new Error("误报操作接口返回了非 JSON 响应");
        }
      }

      if (!response.ok || (result && result.code !== undefined && result.code !== 10000)) {
        throw new Error(result?.message || `误报操作失败，HTTP ${response.status || "未知"}`);
      }

      setButtonState(button, isFalsePositive, payload.falsePositiveReason || "");
      closeModal();
    } catch (error) {
      button.textContent = previousButtonText;
      const message = error instanceof Error ? error.message : String(error);
      if (isFalsePositive) {
        modalError.textContent = message;
      } else {
        setButtonError(button, message);
      }
    } finally {
      button.disabled = false;
      submitButton.disabled = false;
      submitButton.textContent = previousSubmitText;
    }
  }

  const buttonHandlers = buttons.map((button) => {
    const handler = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (button.dataset.isFalsePositive === "true") {
        void submitUpdate(button, false, null);
        return;
      }
      openModal(button);
    };
    button.addEventListener("click", handler);
    return { button, handler };
  });

  const inputHandler = () => {
    countLabel.textContent = String(countUnicodeCharacters(reasonInput.value));
    modalError.textContent = "";
  };
  const cancelHandler = () => closeModal();
  const submitHandler = () => {
    if (!activeButton) {
      return;
    }

    try {
      const payload = buildFalsePositivePayload({
        isFalsePositive: true,
        falsePositiveReason: reasonInput.value,
        findingIndex: Number(activeButton.dataset.findingIndex),
        crReportUrl: location.href,
      });
      void submitUpdate(activeButton, true, payload.falsePositiveReason);
    } catch (error) {
      modalError.textContent = error instanceof Error ? error.message : String(error);
    }
  };

  reasonInput.addEventListener("input", inputHandler);
  cancelButton.addEventListener("click", cancelHandler);
  submitButton.addEventListener("click", submitHandler);

  return {
    destroy() {
      buttonHandlers.forEach(({ button, handler }) => button.removeEventListener("click", handler));
      reasonInput.removeEventListener("input", inputHandler);
      cancelButton.removeEventListener("click", cancelHandler);
      submitButton.removeEventListener("click", submitHandler);
    },
  };
}

export function renderFalsePositiveClientScript(apiUrl = DEFAULT_FALSE_POSITIVE_API_URL) {
  return [
    "<script>",
    `const DEFAULT_FALSE_POSITIVE_API_URL = ${JSON.stringify(apiUrl)};`,
    countUnicodeCharacters.toString(),
    buildFalsePositivePayload.toString(),
    installFalsePositiveInteractions.toString(),
    "installFalsePositiveInteractions({",
    "  document: window.document,",
    "  location: window.location,",
    "  fetchImpl: window.fetch.bind(window),",
    "  apiUrl: DEFAULT_FALSE_POSITIVE_API_URL,",
    "});",
    "</script>",
  ].join("\n");
}
