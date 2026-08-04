# Daily Notes 项目规则

## 文件结构【重要】

- **origin.html**：源文件，笔记数据写在里面的 `NOTES_DATA` 数组（`/*__NOTES_DATA_START__*/` 与 `/*__NOTES_DATA_END__*/` 标记之间）。**所有编辑都改这里**
- **index.html**：压缩产物，由 pre-commit 钩子从 origin.html 自动生成。**禁止手改**
- 两个文件共用同一份渲染代码（双模式）：index.html 的笔记数据是 gzip+base64 内嵌的压缩 blob，页面加载时浏览器用 `DecompressionStream` 本地解压，无需服务器、双击可打开

## 随想记录规则

- 新随想加在 **origin.html** 中 `NOTES_DATA` 数组的**最前面**（倒序排列）
- 每篇随想添加索引编号：#001 为最新，#002 次新，以此类推
- 新增随想后，需重新编排所有现有随想的编号
- 随想内容和正文用 `white-space: pre-wrap` 保留原文格式
- **每次新增时，判断类别**：是「决策」（type: 'decision'）、「搞定的人」（type: 'people'）还是「日常笔记」（不填或 type: 'daily'），加在 `date:` 行后面

## 压缩与构建规则

- **新增/修改笔记 → 改 origin.html → commit（pre-commit 钩子自动压缩生成 index.html）→ git push 发布**
- pre-commit 钩子位于 `.githooks/pre-commit`：检测到 origin.html 有改动时自动运行 `node scripts/compress.js` 并暂存 index.html
- **手动压缩**：`node scripts/compress.js`（零依赖，仅用 Node 内置模块）
- **本地预览**：双击 index.html（压缩版）或 origin.html（原版）都可打开；改了 origin.html 后想预览压缩版，先跑 `node scripts/compress.js`
- **修改样式/渲染逻辑**：改 origin.html，提交后钩子会自动同步到 index.html
- **新克隆环境需一次性配置钩子**：`git config core.hooksPath .githooks`

## 质量检查规则

- **每次修改后必须检查是否有JS语法错误**，验证通过后才提交（`node scripts/compress.js` 成功后，可抽查解压内容是否一致）
- **内容中不要出现具体的公司名称**（如京东、拼多多等），用泛化描述替代

## 发布规则

- **git push 即自动发布 GitHub Pages**（当前从 main 分支直接部署），推送前确保修改已完成验证
