# Mobile Prototype Runtime

本目录只放由产品模板维护、可以同步到既有项目的静态原型基础设施。产品名称、文案、示例数据、业务状态、屏幕坐标和品牌样式不得写进这里。

## 所有权

- 模板拥有：`prototype-runtime.js`、`flow-canvas.js`、`flow-canvas.css` 和本说明。
- 产品拥有：`mobile-screen-model.js`、`mobile-state.js`（如需要）、两个 Adapter、HTML、屏幕坐标和产品样式。
- `mobile-screen-model.js` 是移动端单屏原型与整体流程共享内容和跳转目标的唯一来源。

## 加载顺序

这些脚本保持普通 `<script>`，以便原型继续支持直接通过 `file://` 打开：

```html
<script src="./runtime/prototype-runtime.js"></script>
<script src="./mobile-screen-model.js"></script>
<script src="./mobile.js"></script>
```

流程画布需在产品 Model 前额外加载 `flow-canvas.js`。

## Screen Model Interface

```js
const model = OneePrototypeRuntime.defineScreenModel({
  entryScreenId: 'home',
  screens: {
    home: {
      fields: {
        title: '今天的焦点',
      },
      actions: {
        primary: {
          label: '继续',
          target: 'detail',
        },
      },
    },
    detail: {
      fields: {
        title: '详情',
      },
      actions: {},
    },
  },
});
```

`defineScreenModel` 会拒绝指向不存在屏幕的 action。两个 Adapter 通过 `hydrateModel(root, model)` 读取相同内容：

- `data-model-screen="home"` 选择屏幕。
- `data-model-field="title"` 写入文本字段。
- `data-model-action="primary"` 把 action target 写入 `data-flow-target`。
- `data-model-action-label="primary"` 写入 action 文案。

字段和 action label 的元素在 HTML 中必须保持为空，避免出现第二份真实来源。复杂列表、图表、日历和业务状态由产品 Adapter 渲染。

## Flow Canvas Interface

```js
OneeFlowCanvas.mount({
  canvas: document.querySelector('[data-flow-canvas]'),
  world: document.querySelector('[data-flow-world]'),
  worldSize: { width: 2200, height: 1650 },
});
```

Runtime 只负责拖拽、缩放、适应画布、键盘平移以及按 `data-flow-target` 聚焦屏幕；它不解释任何产品业务。

## 下游同步

`.sync-manifest` 只把本目录标为 `auto`。产品 Model、Adapter、页面和样式不得自动覆盖。升级既有项目时先运行 check，再显式 apply，并保留项目自己的 contract test。
