# Scene List Template

列表页参考模板。

用于新建列表页或列表型改造时，作为设计和实施约束的参考基线。

## 核心约束

- 先检查组件库文档，必要时通过 MCP 获取组件详细用法
- 接口返回值默认直接视为数据本身，禁止继续访问 `response.data`
- `MrpTable` 优先使用 `slotName` 扩展列，避免 `render`
- 分页优先通过表格 `pagination` 属性组织，避免额外分页组件
- 消息提示优先使用 `MrpMessage`
- 日期类控件优先使用 MarsPC 组件库

## 组件拆分建议

- 搜索表单拆分为 `SearchForm.vue`
- 主表格保留在页面主文件
- 编辑 / 新增弹窗拆分为独立组件

## 推荐目录结构

```text
views或pages/[模块名]/
├── components/
│   ├── SearchForm.vue
│   ├── EditModal.vue
│   └── AddModal.vue
├── types/
│   └── index.ts
├── utils/
│   └── index.ts
├── constants.ts
└── index.vue
```

## 主页面关注点

- 页面主文件负责整体布局、分页状态、表格数据加载、弹窗开关状态
- 搜索条件与分页参数分离管理
- 查询、重置、翻页、页大小切换都应回到统一的数据加载函数
- 列配置、状态枚举、固定文案优先抽到 `constants.ts`

## 搜索表单关注点

- 字段不多时使用简单表单
- 字段较多时增加展开 / 收起
- 通过受控值与事件向主页面同步筛选条件

## 适用场景

- 查询列表页
- 带筛选 + 表格 + 分页的页面
- 列表页中带新增、编辑、删除、导出、批量操作的场景
