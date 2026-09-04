# Common Page Template

通用新页面参考模板。

用于不完全属于列表页或表单页，但仍需要遵循统一页面组织方式的新页面开发。

## 核心原则

- 所有新页面优先遵循标准目录结构
- 不同类型的代码放在清晰的目录中，避免全部堆在 `index.vue`
- 页面私有组件、类型、工具、常量按职责拆分
- 参考模板是结构基线，不要求生搬硬套

## 标准目录结构

```text
views或pages/[模块名]/
├── composables/
│   └── usePageLogic.ts
├── components/
│   └── PrivateComponent.vue
├── types/
│   ├── index.ts
│   └── xxx.types.ts
├── utils/
│   ├── helper.ts
│   └── validator.ts
├── constants.ts
└── index.vue
```

## 拆分建议

- `index.vue` 负责页面入口、整体布局与少量编排逻辑
- `composables/` 放复杂状态管理、页面逻辑封装、可复用业务逻辑
- `components/` 放页面私有 UI 组件
- `types/` 放页面类型、表单类型、状态类型、组件 props 类型
- `utils/` 放格式化、校验、计算类工具
- `constants.ts` 放枚举、列配置、提示文案、魔法值

## 适用场景

- 通用业务页
- 仪表盘式页面
- 组合型页面
- 既不是标准列表页也不是标准表单页的新页面
