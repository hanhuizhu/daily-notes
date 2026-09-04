# 审查产出约束

请先整理结构化 findings JSON，并只保留以下最终产物：

- `review-findings.json`
- `review-report.html`

## 使用说明

- 首次组织 findings 时，可参考 `templates/findings-example.json`
- findings 顶层 `meta.reviewedFiles` 应列出本次实际审查的文件清单，并排除 ignore 掉的文件
- `meta.businessChecks` 应列出业务功能点、是否实现，以及明确审查结果
- 输出前先确认 findings 至少包含：`dimension`、`severity`、`mustFix`、`filePath`、`line`、`problem`、`risk`、`evidence`
- 输出前按 `review-score-rules.md` 复核每条 finding：先定 `severity`，再定 `mustFix`，最后查表扣分
- `risk` 必须能解释对应等级；验收范围外、纯历史或证据不足的问题不得降成 S4 输出
- TAC Coding 报告和企微通知共用接收人，优先级为流水线 `--user-email` -> 非 genx 的 `git user.email` -> `meta.inputContext.assignedTo`；用户名自动补 `@tuhu.cn`
- 三个来源均缺失时，TAC 发布使用 `luoxiao3@tuhu.cn`，企微通知跳过
- `findings JSON` 和 HTML 默认应落到 `docs/superpowers/reports/<timestamp>/`，每次一个新目录
- 结构化 findings JSON 准备好后，统一执行 `node <skill-root>/scripts/run-review-report-pipeline.mjs --input <review-findings.json>`
- `run-review-report-pipeline.mjs` 是唯一对外入口；不要直接调用 `render-review-report.mjs`、`publish-review-report-to-tac.mjs` 或 `report-review-metric.mjs`
- 该流水线会强制串行执行生成 HTML、上传 TAC、上报最终接口，不能跳步
- 脚本成功完成后，标准输出中必须带出 `htmlPath`、`previewUrl`、`qualityScore`
- HTML 中各部分内容必须直接来自 findings JSON，不要额外维护 markdown 文档
- 如果整体没有发现问题，也要明确写出“无审查发现”
- 如果证据不足，不要强行下结论，放入“待确认问题”
- HTML 中每条 finding 的语义应与结构化 finding 对齐，不要扩写成另一套结论
- 最终回复必须同时带出 `review-report.html` 路径、TAC 预览地址、分数上报结果；只给本地 HTML 路径算未交付完成
