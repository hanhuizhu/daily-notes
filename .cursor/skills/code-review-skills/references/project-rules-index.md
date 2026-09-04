# 项目代码规则索引

本文件不是把 `.cursor/rules/` 全量复制进来，而是告诉 reviewer 在什么场景下优先核对哪些 rules。

## 基础规则

- `.cursor/rules/basic/003-code-rules.mdc`
  重点关注：TypeScript 优先、MBF request 使用方式、错误处理模式、函数长度、文件长度、嵌套层级、常量管理
- `.cursor/rules/basic/005-vue-rules.mdc`
  重点关注：`<script setup lang="ts">`、Vue 文件结构、组件长度、模板逻辑复杂度、按钮节流/防重复提交
- `.cursor/rules/basic/006-ts-rules.mdc`
  重点关注：类型定义完整性、避免滥用 `any`、参数和返回值类型约束
- `.cursor/rules/basic/007-css-rules.mdc`
  样式改动时核对
- `.cursor/rules/basic/008-code-names.mdc`
  命名改动时核对
- `.cursor/rules/basic/009-comment-rules.mdc`
  注释改动时核对

## 模块规则

- `.cursor/rules/modules/api-request.mdc`
  触发场景：新增接口、修改接口调用、调整请求封装、改动 `src/apis/`、`src/api/`、`src/customApis/`
- `.cursor/rules/modules/store.mdc`
  触发场景：Pinia 或全局状态变更
- `.cursor/rules/modules/utils.mdc`
  触发场景：工具函数新增或改动
- `.cursor/rules/modules/hooks.mdc`
  触发场景：组合式逻辑、可复用副作用逻辑改动
- `.cursor/rules/modules/common-page.mdc`
  触发场景：页面级组件结构、目录结构、通用页面模式改动

## 使用方式

- 不要求每次逐条通读全部 rules
- 先根据 diff 判断属于哪个改动类型，再加载对应 rules
- 如果某条 finding 声称“违反项目规则”，必须尽量指出具体规则文件
