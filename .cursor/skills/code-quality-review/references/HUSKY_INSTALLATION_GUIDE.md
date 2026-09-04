# Code Quality Review - Husky 环境安装流程

## 触发条件

当用户明确表达以下意图之一时，进入 Install 模式：
- 安装环境
- 安装或配置 Husky
- 初始化 pre-commit 审查
- 为当前项目接入 AI Review pre-commit hook

## 安装目标

为当前项目补齐 Husky 与 `.husky/pre-commit` 配置，并确保执行：

```sh
node .cursor/skills/code-quality-review/scripts/precommit-ai-review.mjs
```

## 标准流程

### 1. 检测并安装 Husky

1. 检测当前项目 `package.json` 中是否已安装 `husky`（`dependencies` 或 `devDependencies`）。
2. 如果未安装，则先安装 Husky。
3. 安装失败时，必须停止继续写 hook，并帮助用户解决失败问题后再继续。

**排查方向：**
- `package.json` 不存在或当前目录不是 Node 项目
- 包管理器锁文件与实际使用的包管理器不一致
- 网络、镜像源、权限或 npm registry 配置异常

### 2. 初始化 `.husky` 目录

1. 检测当前项目是否存在 `.husky` 目录。
2. 如果不存在，则执行：

```sh
npx husky install
```

3. 若初始化失败，必须说明失败命令、报错原因，并帮助用户继续排查。

**排查方向：**
- 当前目录不是 Git 仓库
- `npx` 不可用或 Node.js 版本异常
- Husky 已安装但版本不兼容

### 3. 安装或更新 `pre-commit`

目标文件：`.husky/pre-commit`

#### 情况 A：`pre-commit` 已存在

1. 读取现有 `.husky/pre-commit` 内容。
2. 检查是否已经包含以下执行语句：

```sh
node .cursor/skills/code-quality-review/scripts/precommit-ai-review.mjs
```

3. 如果已存在，则提示用户当前项目已完成 AI Review hook 配置，不重复追加。
4. 如果不存在，则在不破坏现有逻辑的前提下新增该执行流程。

#### 情况 B：`pre-commit` 不存在

创建 `.husky/pre-commit`，文件内容为：

```sh
#!/usr/bin/env sh

# AI Review
node .cursor/skills/code-quality-review/scripts/precommit-ai-review.mjs
```

创建后应确保文件具备可执行权限。

## 完成后的反馈要求

安装完成后，必须向用户明确反馈：
- Husky 是否为本次新安装
- `.husky` 是否为本次新初始化
- `pre-commit` 是新增还是更新
- 当前项目是否已具备 AI Review pre-commit 能力

## 失败处理要求

如果任一步骤失败，不得只返回“安装失败”。

必须继续帮助用户完成以下工作：
1. 明确指出失败发生在哪一步
2. 给出关键报错信息或根因判断
3. 提供下一步可执行的修复方案
4. 若可以安全重试，则在修复后继续完成剩余安装流程

## 安全约束

- 修改已有 `.husky/pre-commit` 时，不得覆盖用户原有 hook 逻辑
- 仅在缺失时新增 AI Review 执行语句，避免重复追加
- 若项目不适合直接安装（例如不是 Node 项目），必须先说明原因，再给出替代处理建议
