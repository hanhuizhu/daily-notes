---
name: code-review-skills
description: 当在本仓库中审查功能改动、缺陷修复、Pull Request 或 git diff，且需要按业务功能实现、代码质量、架构合理性和项目 rules 四个部分输出固定中文审查结果时使用。
---

# 代码审查技能

## 概述

这个 skill 是当前仓库的项目级 code review 入口。它不把所有规则都塞进 `SKILL.md`，而是按“入口、规则、模板”拆分，方便单独维护和复用。

## 文件职责

- `SKILL.md`
  只负责触发条件、使用顺序、文件路由。
- `references/review-dimensions.md`
  定义四个审查部分的边界与去重规则。
- `references/review-checklist.md`
  提供实际执行时的检查动作。
- `references/review-inputs.md`
  定义 review 输入归一化方式，包括 code plan、需求文本、Flash 地址。
- `references/review-findings-schema.md`
  定义结构化审查结果字段，供 JSON 和 HTML 复用。
- `references/review-score-rules.md`
  定义问题定级矩阵、must-fix 判定、统一评分机制和结论口径。
- `references/code-quality-rules.md`
  提供“代码质量”部分的规则正文。
- `references/project-rules-index.md`
  提供项目 rules 的查找入口。
- `scripts/review-scope.mjs`
  生成默认 review 范围。
- `scripts/render-review-report.mjs`
  内部脚本：基于结构化 findings 生成 HTML 审查报告，提供问题复制和误报操作；复制会将单条问题整理为结构化 Markdown，误报原因必填且最多 100 个字符。仅供 `run-review-report-pipeline.mjs` 调用。
- `scripts/publish-review-report-to-tac.mjs`
  通过 TAC Coding 报告接口发布 HTML 审查报告，并返回正式页面地址。
- `scripts/report-review-metric.mjs`
  上报最终得分、报告地址和原始 findings；接口字段 `reportDetails` 使用 `JSON.stringify(findings)` 生成 JSON String，保留数组原始顺序与内容，空数组传 `"[]"`。
- `scripts/sync-gitlab-yml-from-ci-config.mjs`
  在 review 最终完成后，将 skill 内 `templates/gitlab.yml` 同步到项目根 `.gitlab-ci.yml`。
- `scripts/run-review-report-pipeline.mjs`
  串行执行整条报告流水线，并在最后强制执行 `.gitlab-ci.yml` 同步。
- `scripts/review-ignore.json`
  维护不参与 review 的文件与目录，以及不输出的已确认误报规则。
- `templates/output-template.md`
  提供最终产出约束和结构化 findings 约束。
- `templates/findings-example.json`
  提供结构化 findings 的示例，降低首次组织 JSON 时的漂移。
- `templates/gitlab.yml`
  保存需要同步到项目根 `.gitlab-ci.yml` 的 GitLab CI 模板内容。
- `templates/reviewer-prompt-addendum.md`
  只负责把这些文件挂接到标准 reviewer 骨架。

## 使用时机

- 用户要求审查当前仓库中的分支、PR、提交区间或代码 diff
- 用户希望使用项目定制规则，而不是泛化的 code review
- 用户希望按固定的四段式模版输出 findings，便于团队沟通
- 改动涉及权限、路由、请求封装、环境配置、MBF 生成文件等高风险区域

不要把这个 skill 用在只输出 JSON 的 pre-commit AI review hook 场景。那类场景继续使用 `.cursor/skills/code-quality-review`。

## 必要输入

- 审查范围：PR、分支、提交区间，或明确给出的文件列表
- 预期行为：需求说明、工单、实施计划、Flash 地址，或改动摘要
- 证据来源：`git diff`、变更文件，以及已有的测试结果或手工验证记录

如果没有提供明确的审查范围，默认审查“当前分支相对 `origin/master` 的全部 commit 内容”。优先运行 `node <skill-root>/scripts/review-scope.mjs` 生成审查范围，不要手工拼接 diff。

## 使用顺序

### 1. 先归一化输入来源

先读 [references/review-inputs.md](references/review-inputs.md)，把用户给出的需求上下文统一成可引用的 review 输入。

- skill 一触发，先获取当前仓库 `git user.email`
- 最终接收人优先级固定为：流水线显式 `--user-email` -> 非空且不包含 `genx` 的 `git user.email` -> 任务或 Flash 返回的 `meta.inputContext.assignedTo`
- 如果 `git user.email` 为空或包含 `genx`，并且上下文里能拿到任务 ID，则必须先调用 `mcp-flash.get_story_task_description`，再把返回的 `assignedTo` 写入 `meta.inputContext.assignedTo`
- 接收人可以是完整邮箱或用户名；值不含 `@` 时，流水线统一补成 `<用户名>@tuhu.cn`
- 如果输入是 code plan，提炼目标范围、模块拆分、验收点
- 如果输入是纯需求文本，提炼业务流程、边界条件、关键约束
- 如果输入是 Flash 地址，先调用 `mcp-flash` 的 `get_story_task_description`
- 将整理结果归一为统一上下文，再和 diff 做一致性比对，不要直接跳过需求侧信息

### 2. 再读审查维度

读 [references/review-dimensions.md](references/review-dimensions.md)，明确这次 review 分成哪四个部分，以及每个部分的边界。

### 3. 再读执行清单

读 [references/review-checklist.md](references/review-checklist.md)，按清单组织审查顺序和证据要求。

### 4. 先确定 review 范围

- 如果用户明确给了 `base/head` 或文件列表，按用户指定范围审查
- 否则运行 `node <skill-root>/scripts/review-scope.mjs`
- ignore 规则以 `<skill-root>/scripts/review-ignore.json` 为准
- 文件范围忽略读取 `entries`；问题类型忽略读取 `ruleEntries`。
- 输出 finding 前必须逐条核对 `ruleEntries`：命中 `ignoreWhen` 的问题不输出，也不降级为 S4；仅命中关键词但不满足语义和 `guardrail` 的，不得忽略。

### 5. 按需加载规则正文

- 代码质量问题：读 [references/code-quality-rules.md](references/code-quality-rules.md)
- 项目规范问题：读 [references/project-rules-index.md](references/project-rules-index.md)
- 结构化 findings 字段：读 [references/review-findings-schema.md](references/review-findings-schema.md)
- 评分规则：读 [references/review-score-rules.md](references/review-score-rules.md)
- 输出 finding 前，必须先按评分规则排除不构成 finding 的内容，再依次确定 `severity`、`mustFix` 和扣分

### 6. 先产出结构化 findings，再强制串行执行报告流水线

- 先按 [references/review-findings-schema.md](references/review-findings-schema.md) 整理结构化 findings
- 再按 [templates/output-template.md](templates/output-template.md) 校对最终产出约束
- TAC Coding 报告和企微通知共用同一接收人解析结果：显式 `--user-email` -> 非 genx 的 `git user.email` -> findings 的 `meta.inputContext.assignedTo`；用户名自动补 `@tuhu.cn`
- 三个来源都取不到时，TAC 发布默认使用 `luoxiao3@tuhu.cn`，企微通知跳过
- 结构化 findings JSON 准备好后，必须统一执行下面这个流水线入口，不要手动拆成 3 个独立命令
- `run-review-report-pipeline.mjs` 是唯一对外入口；不要直接调用 `render-review-report.mjs`、`publish-review-report-to-tac.mjs` 或 `report-review-metric.mjs`
- 流水线内部会严格按“生成 HTML 报告 -> 以 `codereview` 类型发布 TAC Coding 报告 -> 上报最终得分和 TAC 地址 -> 推送通知 -> 同步根目录 .gitlab-ci.yml”顺序执行
- 消息通知必须读取同一份 `review-findings.json`，在需求名称下展示逐条标红的必须修复的问题标题、Review 总结和是否可合并，不得维护独立结论
- HTML 报告中每条问题都提供误报操作；标记误报时必须填写不超过 100 个字符的误报原因，取消误报时无需填写原因
- 只有前一步成功，后一步才会开始；任一步失败，整个流程立即中断
- `sync-gitlab-yml-from-ci-config.mjs` 会读取 skill 内 `templates/gitlab.yml`
  - 如果项目根不存在 `.gitlab-ci.yml`，就新建该文件并写入完整内容
  - 如果项目根已存在 `.gitlab-ci.yml`，就在文件末尾追加一段受托管的模板内容；后续重复执行时只更新这段托管块，避免越跑越长
- `findings JSON` 和 HTML 审查报告默认输出到项目根目录下的 `docs/superpowers/reports/<timestamp>/`
- 每次 review 新建一个独立目录，至少包含 `review-findings.json` 和 `review-report.html`
- 成功完成后，脚本标准输出必须包含 `htmlPath`、`previewUrl`、`qualityScore`；缺任一项都视为这次 review 没有真正完成

```bash
node <skill-root>/scripts/run-review-report-pipeline.mjs \
  --input <review-findings.json>
```

- 评分、分支名、TAC 地址等上报数据由流水线按脚本约定自动处理；如需覆盖，优先使用对应脚本参数
- 如果要派发 reviewer subagent，把 [templates/reviewer-prompt-addendum.md](templates/reviewer-prompt-addendum.md) 拼接到标准 `superpower` reviewer 骨架后面

## 结构化产出要求

- 最终产出只保留结构化 findings JSON 和 HTML 审查报告
- 如需跨人查看，可把 HTML 再上传 TAC，输出在线预览 URL
- HTML 必须来自同一份 findings JSON，不允许再额外维护另一套文档结论
- 每条 finding 至少包含：维度、严重程度、是否必须修复、文件路径、行号、问题描述、风险、证据
- 如果引用了规则或需求，优先给出具体规则文件或需求来源字段
- 如果没有发现问题，也要生成“无审查发现”的 findings JSON 和 HTML 报告
- 最终回复中必须明确回填 `review-report.html` 路径、TAC `previewUrl`、`qualityScore`；缺任一项都算漏流程

## 核心原则

- 优先报告明确缺陷、功能回归、校验缺失、验证缺失，不要把重点放在样式评论上
- 不要因为看到了历史遗留代码就直接报问题，除非这次改动依赖了它，或把它变得更糟
- 不要把生成产物当成唯一真相，要核对对应的源文件或配置是否也一起更新了
- 所有判断都优先引用需求、实施计划、rules 原文或模板文件，不重复改写这些内容
- Flash 地址只是需求入口，不是结论依据；仍然要回到实际 story 详情、任务描述和 diff 证据
