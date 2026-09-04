---
name: code-quality-review
description: 当用户需要 pre-commit AI 审查、结构化 JSON 质量报告、历史问题修复验证、根据审查报告修复问题，或安装 Husky 审查环境时使用。也可由 precommit-ai-review.mjs 自动触发。
---

# Code Quality Review Skill

本 skill 分为 Review、Repair 与 Install 三种模式，根据提示词语义路由执行。

## 模式路由

- **Review 模式（默认）**：当提示词要求 pre-commit 审查、JSON 质量报告、历史问题修复验证，或已明确提供“文件列表 + git diff”作为机器审查输入时，执行 Review。
- **Repair 模式**：当提示词明确要求“修复问题/自动修复/根据报告修复”时，执行 Repair。
- **Install 模式**：当提示词明确要求“安装环境/安装 pre-commit 审查环境/配置 Husky/初始化 AI Review hook”等时，执行 Install。

## 使用边界

- 这个 skill 主要服务于 pre-commit / hook / JSON 报告链路
- 如果用户要的是面向人工阅读的项目级代码审查、PR 审查、分支审查、需求对照审查、HTML 报告，优先使用 `code-review-skills`
- 不要把泛化的“代码审查”默认路由到本 skill，除非上下文已经明确是 pre-commit AI review 或 JSON 输出链路

## Install 模式（环境安装）

当用户表明需要安装环境时，负责为当前项目安装或补齐 Husky pre-commit AI Review 配置。

安装流程、标准 `pre-commit` 内容与失败排查要求见 [HUSKY_INSTALLATION_GUIDE.md](references/HUSKY_INSTALLATION_GUIDE.md)

## Review 模式（审查）

对提示词中已提供的代码变更（文件列表 + git diff）进行全面质量审查，输出结构化 JSON 报告。

### Review 模式 1：历史问题修复验证

当提示词中包含 **"审查模式：历史问题修复验证"** 和 **"历史遗留问题"** 时，执行此模式：

**任务：** 仅验证历史遗留的 mustFix 问题是否在本次代码变更中已全部修复。

**执行步骤：**
1. 逐个检查历史遗留问题列表中的每个问题
2. 审查变更行（`+`、`-` 开头）及其上下文，不审查未变更代码。+ 代表新增、- 代表已删除。
3. 对比代码变更（git diff），判断问题是否已修复。
4、**如果这个问题在当前改动的代码行中已经不存在了，视为该问题已经修复。**
5. 只输出**仍未修复**的问题到 JSON 报告中
6. 已修复的问题不输出

**重要：**
- **不发现新问题**：只验证历史问题，不进行新的代码审查
- **只输出未修复**：已修复的问题不在报告中出现
- 如果所有历史问题都已修复，返回空报告（`files: []`，`summary: { mustFix: 0, ... }`）

### Review 模式 2：完整代码审查

当提示词中**没有**历史问题时，执行正常的完整审查：

**任务：** 对代码变更进行全面审查，识别所有新问题。

**审查重点：** 详细判断标准及阻断规则见 [REVIEW_STANDARDS.md](references/REVIEW_STANDARDS.md)

**审查范围限制：**
- 只审查变更行（`+`、`-` 开头）及其上下文，不审查未变更代码。+ 代表新增、- 代表已删除
- 默认不对纯说明性注释提出风格类问题；但若注释定义了业务规则、前置条件、兜底策略、副作用、开关生效范围，或注释掉的代码会影响逻辑判断，则必须审查
- 仅存在于 `-` 删除行的问题不得作为新问题输出；新问题必须在 `+` 新增行或变更后保留的上下文中有明确证据
- 当 diff 上下文不足以支撑业务判断时，只能输出当前变更中可被明确证明的问题，禁止基于猜测补全上下文
- 禁止审查 `.cursor/` 目录下的文件

## 输出格式【强制要求】

**关键规则：直接输出 JSON，禁止添加任何说明文字、分析过程或解释内容。**
**所有问题必须输出 `userType` 字段，默认值固定为 `"yes"`。**
**仅在 Review 模式下增加格式自检：输出前先检查是否完全符合本节 JSON 结构；若不符合，必须立即按规范重新输出，直到格式正确为止。**

严格输出以下 JSON 格式：

```json
{
  "files": [
    {
      "path": "文件路径",
      "issues": [
        {
          "level": "mustFix 或 shouldFix",
          "line": 行号,
          "type": "checkpoint-error/runtime-error/security/performance/logic-error",
          "userType": "yes",
          "message": "问题描述",
          "suggestion": "修复建议"
        }
      ]
    }
  ],
  "summary": {
    "mustFix": 0,
    "shouldFix": 0,
    "total": 0
  }
}
```

无问题时输出：

```json
{
  "files": [],
  "summary": { "mustFix": 0, "shouldFix": 0, "total": 0 }
}
```

## Repair 模式（修复）

当提示词明确要求“对问题进行修复”时，读取仓库根目录 `.ai-review-report.json`，按报告定位问题并进行修复。

**Repair 模式强约束：**
- `.ai-review-report.json` 仅作为输入清单读取，禁止通过修改、删除、清空或重写该文件来规避问题
- Repair 模式只能修改实际存在问题的业务代码、配置或测试；不能把“改报告内容”视为修复
- 若某问题暂时无法修复，必须在输出清单中说明原因，而不是修改报告将其移除

修复流程与输出清单要求见：`references/REVIEW_REPAIR_GUIDE.md`。
