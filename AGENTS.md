# Daily Notes 项目规则（Codex）

Codex 会读取本文件。本仓库是一个单页 HTML 随想笔记，`origin.html` 是唯一源文件，`index.html` 是从源文件自动压缩生成的产物。

## 文件结构【重要】

- **origin.html**：源文件。笔记数据写在 `NOTES_DATA` 数组内，位于 `/*__NOTES_DATA_START__*/` 与 `/*__NOTES_DATA_END__*/` 标记之间。所有内容修改都改这里。
- **index.html**：压缩产物，由 `node scripts/compress.js` 从 `origin.html` 生成。禁止手改，不要直接编辑它的笔记数据。
- **scripts/compress.js**：零依赖压缩脚本，只使用 Node 内置模块。
- **.githooks/pre-commit**：配置钩子后，检测到 `origin.html` 变更会自动压缩并暂存 `index.html`。

## 编辑规则

- 新笔记加在 `NOTES_DATA` 数组的最前面，保持倒序。
- 每条笔记包含 `date`、`type`、`content` 三个字段。
- `type` 取值参考现有数据：`goal`、`decision`、`people`、`daily`。
- `content` 使用模板字符串，保留原文换行。
- 修改内容时只改 `origin.html`，不要手动修改 `index.html`。

## 压缩与发布流程

1. 修改 `origin.html`。
2. 运行 `node scripts/compress.js` 重新生成 `index.html`。
3. 检查 `origin.html` 的 `NOTES_DATA` 能正常解析、没有 JS 语法错误。
4. 提交并推送；GitHub Pages 从 `main` 分支自动发布。

如果新环境没有配置钩子，先执行：

```bash
git config core.hooksPath .githooks
```

不要假设提交钩子一定存在，提交前最好手动运行 `node scripts/compress.js`，确保 `index.html` 与 `origin.html` 同步。

## 质量规则

- 内容中不要出现具体公司名称，用泛化描述替代。
- `index.html` 必须由脚本生成，不允许手工同步。
- 如果用户要求更新 `index.html`，实际动作是更新 `origin.html`，再生成 `index.html`。
