# 审查检查清单

按四个审查部分使用本清单。只报告那些能被当前 diff、需求/计划文档、rules 原文或直接相关上下文明确支持的问题。

## 1. 通用前置检查

- 如果用户没有明确指定范围，是否先运行了 `node <skill-root>/scripts/review-scope.mjs`？
- 当前待审文件是否已经过 `<skill-root>/scripts/review-ignore.json` 过滤？
- 当前 finding 是否已经过 `<skill-root>/scripts/review-ignore.json` 的 `ruleEntries` 过滤？仅忽略明确命中的误报场景，不按关键词泛化屏蔽。
- 这个 finding 是否由当前 diff 支撑，而不是来自未改动的历史代码？
- 是否已经阅读了足够的邻近上下文，避免靠猜测下结论？
- 如果需求、计划或规则信息不完整，是否把它归入“待确认问题”，而不是自行脑补？

## 2. 业务功能的实现

- 本次 diff 是否完整覆盖了需求或实施计划中的业务功能？
- 是否存在漏实现、错实现、范围漂移，或关键用户流程中断？
- 权限控制、表单校验、上传下载、列表筛选分页、空态错误态是否与需求一致？
- 如果改动涉及 API 返回结构、状态流转、字段映射，是否同步覆盖了业务链路上下游？

## 3. 代码的质量

- 严格依据 [code-quality-rules.md](code-quality-rules.md) 审查
- 不要混入主观风格偏好；只报有明确规则依据的问题
- 对无法从 diff 证明的问题，默认不输出
- 如果当前 diff 涉及 bridge 的新增、调用或修改，在最终 findings 的 `meta.codeQualityRiskTips` 中追加“风险提示”，用于提醒多端、多版本兼容性验证，但不要把它写成扣分 finding

## 4. 架构的合理性

- 如果有实施计划，文件落点、模块拆分、职责边界、调用方向是否遵循计划？
- 业务逻辑是否被放进了合适的层次，而不是堆进页面或组件模板？
- API、store、utils、view、component 的边界是否清晰？
- 如果 `.mbf`、`.mbf-production`、env、常量、枚举被修改，是否同步更新了对应源头或依赖方？

## 5. 项目 rules 的遵循情况

- 严格依据 [project-rules-index.md](project-rules-index.md) 选择要核对的 rules
- Vue 文件是否符合 `.cursor/rules/basic/005-vue-rules.mdc`
- 通用编码模式是否符合 `.cursor/rules/basic/003-code-rules.mdc`
- API 请求改动是否符合 `.cursor/rules/modules/api-request.mdc`
- 其他 rules 违例要尽量指出具体规则文件，而不是笼统地说“违反项目规范”

## 6. 测试与验证

- 逻辑较重的改动是否有自动化测试？如果没有，是否明确说明了风险？
- 对于 bugfix，是否至少有一个“修复前会失败、修复后通过”的验证步骤？
- 对于导出、上传、下载、权限、结算等高风险流程，是否至少验证了一个成功路径和一个失败路径？
