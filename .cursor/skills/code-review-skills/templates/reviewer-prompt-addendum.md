# Reviewer 提示词附加模板

把本文件拼接到标准 `superpower` reviewer 骨架后面使用。

## 推荐组合方式

1. 先使用当前环境的标准 reviewer 骨架，例如 `superpowers:requesting-code-review`
2. 正常填写审查范围、需求说明、`BASE_SHA`、`HEAD_SHA` 和改动摘要
3. 再把下面这段附加要求拼上去，让 reviewer 同时遵循本仓库的规则

## 项目附加要求

```md
在标准审查清单之外，直接以以下文件作为唯一事实来源：
- `<skill-root>/references/review-inputs.md`
- `<skill-root>/references/review-dimensions.md`
- `<skill-root>/references/review-checklist.md`
- `<skill-root>/references/review-findings-schema.md`
- `<skill-root>/references/review-score-rules.md`
- `<skill-root>/references/code-quality-rules.md`
- `<skill-root>/references/project-rules-index.md`
- `<skill-root>/templates/output-template.md`
- `<skill-root>/templates/findings-example.json`

要求：
- skill 一触发，先获取当前仓库 `git user.email`
- 如果 `git user.email` 为空或包含 `genx`，并且上下文里能拿到任务 ID，则必须先调用 `mcp-flash.get_story_task_description`，再把返回的 `assignedTo` 写入 findings 的 `meta.inputContext.assignedTo`
- 最终接收人优先级固定为：流水线显式 `--user-email` -> 非 genx 的 `git user.email` -> findings 的 `meta.inputContext.assignedTo`
- 三个来源都允许传用户名或完整邮箱；用户名会自动补成 `<用户名>@tuhu.cn`
- 先识别输入来源：code plan、需求文本或 Flash 地址
- 如果输入是 Flash 地址，先调用 `mcp-flash` 的 `get_story_task_description`
- 先将需求上下文归一化，再开始对比 diff
- 如果用户没有明确指定审查范围，先运行 `node <skill-root>/scripts/review-scope.mjs`
- 默认只审查该脚本产出的 includedFiles 与对应 diff
- `<skill-root>/scripts/review-ignore.json` 中匹配到的文件不参与 review
- `<skill-root>/scripts/review-ignore.json` 的 `ruleEntries` 是问题类型忽略列表。输出 finding 前必须先逐条核对 `ignoreWhen` 和 `guardrail`：命中规则的问题直接忽略，不降级成 S4；仅关键词相似但语义不满足的 finding 仍需正常审查。
- 当前已确认的规则忽略包括：`ai-remark-marker`（不再要求 ai-remark AI 注释标记）和 `mbf-api-swimlane-test-only`（`.mbfrc.api.ts` 泳道仅测试环境联调配置）。后者不适用于有生产影响、接口路由错误或真实业务行为异常的证据。
- 不要重复改写这些文件中的规则、维度或模板
- 输出顺序必须固定：
  1. 先形成完整的 findings JSON，可参考 `templates/findings-example.json`
  2. 再基于同一份 findings JSON 生成 HTML 报告并完成后续上传、上报
- 每条 finding 都必须包含 `file:line`、问题是什么、为什么重要，以及具体风险
- 每条 finding 至少要有：`dimension`、`severity`、`mustFix`、`filePath`、`line`、`codeSnippet`、`problem`、`risk`、`evidence`
- 输出 finding 前必须先排除验收范围外能力、未被本次改动影响的历史问题和证据不足的猜测；证据不足时写入 `questions`，不要降成 S4 凑数
- 严格按 `review-score-rules.md` 的定级矩阵确定 `severity`，再独立判断 `mustFix` 并执行组合校准；`risk` 中必须体现实际后果和影响范围
- findings 的 `meta.reviewedFiles` 必须列出本次实际审查的文件清单，并排除 ignore 掉的文件
- findings 的 `meta.businessChecks` 必须列出业务功能点、是否已实现，以及明确审查结论
- 如果当前 diff 涉及 bridge 的新增、调用或修改，必须在 findings 的 `meta.codeQualityRiskTips` 中补充一条非评分提示，格式为“代码变更中使用了 xxx 和 xxx bridge，请确保 bridge 在多端、多版本下的客户端兼容性问题。”
- findings 的 `meta.inputContext.assignedTo` 保存任务或 Flash 返回的负责人，可传用户名或完整邮箱
- TAC Coding 报告与企微通知必须共用同一接收人解析结果；三个来源都缺失时，TAC 发布默认使用 `luoxiao3@tuhu.cn`，企微通知跳过
- 审查结束后，不要手动拆分执行报告相关脚本，统一调用 `node <skill-root>/scripts/run-review-report-pipeline.mjs --input <review-findings.json>`
- `run-review-report-pipeline.mjs` 是唯一对外入口；不要直接调用 `render-review-report.mjs`、`publish-review-report-to-tac.mjs` 或 `report-review-metric.mjs`
- `findings JSON` 和 HTML 报告默认输出到项目根目录下的 `docs/superpowers/reports/<timestamp>/`
- 每次审查必须新建一个独立目录，并至少包含 `review-findings.json` 和 `review-report.html`
- 这个流水线必须强制串行执行“生成 HTML 报告 -> 以 `codereview` 类型发布 TAC Coding 报告 -> 上报 `gitBranch`、`qualityScore`、`crReportUrl` -> 推送通知 -> 同步根目录 `.gitlab-ci.yml`”，前一步失败时后一步不得继续
- 审查最终完成后，必须由 `run-review-report-pipeline.mjs` 内部自动执行 `sync-gitlab-yml-from-ci-config.mjs`
- `sync-gitlab-yml-from-ci-config.mjs` 必须读取 `<skill-root>/templates/gitlab.yml`
- 如果项目根不存在 `.gitlab-ci.yml`，就新建并写入完整内容
- 如果项目根已存在 `.gitlab-ci.yml`，就在文件末尾维护一段受托管的模板同步块；重复执行时只更新这段托管块，避免重复追加
- 脚本成功完成后，标准输出里必须能明确看到 `htmlPath`、`previewUrl`、`qualityScore`；缺任一项都视为流程未完成
- 最终回复必须显式给出本地 `review-report.html` 路径、TAC `previewUrl`、分数上报结果；如果只给本地 HTML 或 findings 结论，视为漏掉收尾步骤
- 除非用户明确要求审 automation 或 skill 文件，否则不要审 `.cursor/` 目录
- 如果没有发现问题，要在 findings JSON 和 HTML 中明确写出“无审查发现”，并补充剩余测试缺口或信心边界
- 评分必须遵循 `review-score-rules.md`，不要自定义另一套算法
- 不要为了得到预期分数反推或调整 `severity`、`mustFix`
```

## 兜底方式

如果标准 superpower reviewer 不可用，就把本文件和 `SKILL.md` 一起作为完整的审查说明使用。
