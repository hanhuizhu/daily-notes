# 审查输入归一化

每次 review 都先把输入整理成统一上下文，再进入四个审查维度。不要一边看 diff 一边临时猜需求。

## 前置负责人解析

skill 一触发就先执行下面的负责人解析，不要等到报告流水线阶段再补：

1. 获取流水线显式参数 `--user-email`
2. 获取当前仓库 `git user.email`
3. 如果 `git user.email` 为空或包含 `genx`，并且当前上下文里能拿到任务 ID，则必须调用 `mcp-flash.get_story_task_description`
4. 将任务或 Flash 返回的负责人写入 `meta.inputContext.assignedTo`
5. 最终接收人按 `--user-email` -> 非 genx 的 `git user.email` -> `meta.inputContext.assignedTo` 解析
6. 接收人不含 `@` 时自动补成 `<用户名>@tuhu.cn`

约束：
- `meta.inputContext.assignedTo` 表示任务或 Flash 返回的负责人，可以是用户名或完整邮箱
- TAC Coding 报告和企微通知必须使用同一份解析结果
- 如果 `git user.email` 不可用，且上下文中也无法定位任务 ID，则可以继续审查，但后续消息通知允许被跳过

## 支持的输入类型

### 1. code plan / 执行计划

适用场景：
- 用户直接提供 plan 文档
- 用户贴出 implementation checklist
- 用户说明“按这个计划执行过，请 review”

归一化时至少提炼：
- 功能目标
- 涉及模块和文件落点
- 关键步骤或验收点
- 明确不在本次范围内的内容

### 2. 纯需求文本 / 工单描述

适用场景：
- 用户给了一段需求说明
- 用户给的是 PR 描述、变更摘要、业务背景

归一化时至少提炼：
- 用户流程
- 业务规则
- 关键字段、状态、权限、边界条件
- 成功路径和失败路径

### 3. Flash 地址

适用场景：
- 用户给的是 Flash story 地址
- 需求正文不在当前对话里，需要从 Flash 拉取

处理要求：
- 先从地址中定位 story 标识
- 调用 `mcp-flash` 的 `get_story_task_description`
- 只把返回结果中与本次改动相关的需求、任务描述、验收信息提炼出来
- 如果当前仓库 `git user.email` 为空，或包含 `genx`，则在拿到任务 ID 后必须调用 `mcp-flash.get_story_task_description`
- 如果走了上一步，则返回的 `assignedTo` 必须写入 `meta.inputContext.assignedTo`

禁止做法：
- 只根据 Flash URL 文本猜需求
- 不调用 story 详情就直接下结论
- 把 Flash 的无关讨论原样复制进审查结论
- 在 `git user.email` 为空或包含 `genx`，且可识别任务 ID 的情况下，跳过 `assignedTo` 的补全

## 统一上下文字段

归一化后，建议至少形成以下结构：

```json
{
  "inputType": "code-plan | requirement-text | flash-url",
  "sourceLabel": "需求文档标题 / Flash story 标题 / plan 标题",
  "sourceUrl": "可选，原始链接",
  "assignedTo": "可选；任务或 Flash 返回的负责人，可传用户名或完整邮箱；用户名会自动补 @tuhu.cn",
  "requirementSummary": "本次 review 的需求摘要",
  "taskDescription": "实施任务描述或计划摘要",
  "acceptanceHints": [
    "验收点 1",
    "验收点 2"
  ],
  "outOfScope": [
    "明确不在本次范围内的内容"
  ]
}
```

## 使用要求

- 没有需求上下文时，可以先 review 代码质量和 rules，但业务实现类结论必须降低信心，必要时放入“待确认问题”
- 如果同时拿到了 code plan 和需求文本，优先以需求为“做什么”的依据，以 plan 为“怎么拆”的依据
- 如果 Flash 返回内容和实际 diff 范围明显不一致，要把这种偏差作为待确认问题写出
- 如果当前仓库 `git user.email` 为空或包含 `genx`，并且输入上下文里能够定位任务 ID，则 `meta.inputContext.assignedTo` 为必填
- 如果当前仓库 `git user.email` 非空且不包含 `genx`，运行时优先使用 Git 邮箱；不要为了通知而把 Git 邮箱写进 `meta.inputContext.assignedTo`
