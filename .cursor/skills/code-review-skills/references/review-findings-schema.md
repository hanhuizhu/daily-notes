# 结构化审查结果字段

HTML 和评分都必须基于同一份结构化 findings 数据。

## 顶层结构

```json
{
  "meta": {
    "title": "审查标题",
    "reviewScope": "base..head / PR / branch",
    "branch": "feature/example",
    "generatedAt": "2026-05-12T10:00:00+08:00",
    "reviewer": "Codex",
    "reviewedFiles": [
      "src/views/example/index.vue"
    ],
    "businessChecks": [
      {
        "feature": "筛选条件翻页后保持",
        "passed": true,
        "detail": "翻页只更新 pageNo，未重置 queryParams",
        "requirementRef": "验收点: 翻页后保留筛选条件"
      }
    ],
    "codeQualityRiskTips": [
      "代码变更中使用了 carrierBridge 和 scanBridge，请确保 bridge 在多端、多版本下的客户端兼容性问题。"
    ],
    "inputContext": {
      "inputType": "code-plan | requirement-text | flash-url",
      "sourceLabel": "来源标题",
      "sourceUrl": "可选",
      "assignedTo": "任务或 Flash 返回的负责人；可传用户名或完整邮箱，用户名会自动补 @tuhu.cn",
      "requirementSummary": "需求摘要",
      "taskDescription": "任务描述",
      "acceptanceHints": ["验收点"]
    }
  },
  "findings": [],
  "questions": [],
  "summary": {
    "ready": "Yes | No | With fixes",
    "reasoning": "1-2 句话"
  }
}
```

## 单条 finding 字段

```json
{
  "id": "F-001",
  "dimension": "业务功能的实现 | 代码的质量 | 架构的合理性 | 项目 rules 的遵循情况",
  "severity": "S1 | S2 | S3 | S4",
  "mustFix": true,
  "title": "简短问题标题",
  "filePath": "src/views/example/index.vue",
  "line": 128,
  "endLine": 132,
  "codeSnippet": "关键代码片段",
  "problem": "问题是什么",
  "risk": "为什么重要，可能造成什么影响",
  "evidence": [
    "直接证据 1",
    "直接证据 2"
  ],
  "ruleRef": "可选，规则文件或条目",
  "requirementRef": "可选，需求点、计划步骤或 Flash 任务描述",
  "suggestion": "可选，修复方向"
}
```

## 字段要求

- `dimension` 必须严格落在四个固定部分之一
- `severity` 必须使用统一等级，交由评分规则消费
- `mustFix` 表示是否阻断合入；不要用模糊话术代替布尔值
- `severity` 必须依据 `review-score-rules.md` 的定级矩阵判断；命中多个等级时取后果最严重的等级
- `mustFix` 必须在确定 `severity` 后独立判断，并按组合校准规则复核；不要用等级名称直接代替是否阻断合入
- `risk` 必须写明定级所依据的实际后果和影响范围；可恢复性或替代路径会影响定级时也要写明
- `filePath`、`line` 必须尽量精确；若问题跨多行，可补 `endLine`
- `codeSnippet` 只保留必要上下文，避免整段大代码
- `evidence` 只写当前 diff、需求、计划、规则或直接相关上下文可证明的证据
- `ruleRef` 和 `requirementRef` 至少命中一个时，优先填写具体来源
- `meta.reviewedFiles` 用来列出本次实际审查的文件清单，需排除 ignore 掉的文件和未审文件
- `meta.businessChecks` 只用于“业务功能的实现”部分，列出具体功能点、是否实现、以及明确的审查结论
- `meta.codeQualityRiskTips` 只用于“代码的质量”部分展示非评分提示，不参与 finding 计数、风险等级和扣分
- 如果当前 diff 涉及 bridge 的新增、调用或修改，应在 `meta.codeQualityRiskTips` 中补一条固定提示，明确列出涉及的 bridge 名称
- TAC Coding 报告和企微通知共用同一接收人解析结果，优先级为：流水线 `--user-email` -> 非 genx 的 `git user.email` -> `meta.inputContext.assignedTo`
- 三个来源的值都可以是用户名或完整邮箱；用户名会自动补成 `<用户名>@tuhu.cn`
- 三个来源均缺失时，TAC 发布使用 `luoxiao3@tuhu.cn`，企微通知跳过
- 如果当前仓库 `git user.email` 为空或包含 `genx`，且上下文可定位任务 ID，则这个字段为必填，值必须来自 `mcp-flash.get_story_task_description` 的 `assignedTo`

## 定级前检查

形成 finding 前依次确认：

1. 问题属于当前 review 范围，并有 diff、需求、规则或可复现证据
2. 问题不属于验收范围外能力、纯历史问题或非评分提醒
3. 已按实际后果、影响范围、可恢复性和替代路径确定 `severity`
4. 已独立判断 `mustFix`，并完成 `severity + mustFix` 组合校准

任一步无法确认时，不要强行生成低等级 finding；证据待补充的内容放入 `questions`。

## businessChecks 字段

用于承载业务功能点核对表：

```json
[
  {
    "feature": "功能点名称",
    "passed": true,
    "detail": "明确的审查结论，说明为什么判定为已实现或未实现",
    "requirementRef": "可选，对应需求点或验收点"
  }
]
```

要求：
- `feature` 必须是具体功能点，不要写成笼统标题
- `passed: true` 表示已实现，`passed: false` 表示未实现或存在明确偏差
- `detail` 必须给出明确判断依据，不能只写“正常”或“异常”

## questions 字段

用于承载证据不足但值得提醒的问题：

```json
[
  {
    "title": "待确认事项标题",
    "detail": "缺失的上下文或需要补充验证的信息"
  }
]
```

## 无问题场景

如果没有 finding：
- `findings` 传空数组
- `questions` 仍可保留验证缺口
- `summary.ready` 可以是 `Yes` 或 `With fixes`
- HTML 要明确写“无审查发现”
