# MapLibre 在当前 unified-map 架构下的能力分类

本文档回答的问题是：

> 按照当前这套 `unified-map` 架构，MapLibre GL JS 能直接实现什么、能通过适配器桥接出什么、又有哪些能力虽然 MapLibre 原生支持，但当前 core 还没有标准化入口。

## 1. 判定口径

这里的“当前架构”特指仓库里现在这套 core 抽象，而不是更早期的设计草图：

- `Map / Source / Layer / Overlay / Control / Adapter / Capability`
- `TypedEvented / MapEventMap / SourceEventMap / LayerEventMap / OverlayEventMap / ControlEventMap`
- `AbstractMap.load() -> mount() -> destroy()` 的地图生命周期
- `AbstractMapEntity` 的 `draft -> mounted -> disposed` 生命周期，以及 `Map` 对实体的托管约束
- `AbstractMapAdapter.createMap()` 必须一次性完成 `initialView`、`style`、`interactive` 等初始状态
- `AbstractMap.patchMapOptions()` / `setStyle()` 这条地图级运行时配置更新链路
- `MapEventBridge` 与 `emitFromAdapter()` 的 adapter-only 事件回灌约束
- `Source updated/dataChanged -> queueMicrotask -> adapter.updateSource()` 的 source 刷新合并逻辑
- `AbstractLayer / AbstractDataLayer / AbstractSystemLayer`
- `CameraState / CameraTransition / SourceDefinition / LayerDefinition / OverlayDefinition / ControlDefinition`
- `SourceDefinition.engineExtensions?.maplibre.source`（原 `mapLibreSource`）
- `DataLayerDefinition.engineExtensions?.maplibre.layer`（原 `mapLibreLayer`）
- 当前 `MapCapability` 能力集合
- 当前 `PseudoMapLibreAdapter` 的 capability 标记

判定规则分三档：

- `直接实现`
  - 对应当前 capability profile 里的 `native`，并且 core 已经有正式公共槽位。
  - 真实 adapter 基本可以把统一定义直接翻译成 MapLibre 原生 API，不需要额外账本来“伪造”对象模型。
- `可模拟实现`
  - 对应当前 capability profile 里的 `emulated`，或者 MapLibre 虽然能做，但当前 core 语义与 MapLibre 原生模型并不完全同构。
  - adapter 往往要补 DOM bridge、命名层组、内部注册表，或者把一个统一对象翻译成多个原生对象。
- `当前架构下做不到标准化接入`
  - 不是说 MapLibre 没能力，而是当前统一 API 还没有正式方法、正式类型或足够明确的契约。
  - 业务层如果要用，只能走 adapter 私有 helper，不能算已经接进当前标准 API。

说明：

- 结论优先与当前代码中的 `src/unified-map/core/*` 和 `src/unified-map/pseudo/pseudo-adapters.ts` 对齐。
- 文中凡是写到“推断”的地方，都是基于当前 core 契约与 MapLibre 官方 API 契合度做的工程判断。
- 这份文档会刻意区分两件事：
  - `PseudoMapLibreAdapter` 当前把某项 capability 标成了什么
  - 当前 `AbstractMap` / `AbstractLayer` / `types.ts` 是否已经真的给业务层暴露了正式入口

## 2. 总结结论

一句话总结：

- 当前这套 core 已经把引擎特定字段从核心类型中解耦，MapLibre 特定结构现在通过 `engineExtensions.maplibre` 挂点提供，而不是直接暴露在 `SourceDefinition` 和 `DataLayerDefinition` 里。不过核心模型仍然是参考 MapLibre 设计的，包括 `createMap()` 负责初始视角与运行时选项、`setStyle()` 负责运行期样式切换、`viewChanged` 必须由 adapter bridge 回灌这些契约。
- `Map` 生命周期、`Source + DataLayer` 分离模型、样式切换、投影换算、GeoJSON 聚合、Marker / Popup、控件，都是 MapLibre 最自然的落点。
- 真正的错位现在主要集中在四块：
  - `AbstractSystemLayer` 仍然更像统一层的“命名系统层槽位”，不是 MapLibre 原生的一等对象。
  - `AbstractOverlay` 的线面对象语义并不等同于 MapLibre 最佳实践，MapLibre 更适合用 source/layer 表达矢量内容。
  - `events.keyboard` 仍然主要依赖容器 DOM bridge。
  - `query.features`、真正的 `terrain`、`feature-state` 等高级能力，虽然引擎原生很强，但当前 core 还没有完整公共 API。
- 另外，当前事件模型已经更严格：
  - `viewChanged` 表示“adapter 观察到了真实视角变化”，不是 `setView()` 的同步回执。
  - `Source` 刷新会被微任务合并，这对 MapLibre 的 source 更新链路非常友好。

## 3. 直接实现的能力

| 能力 | 结论 | MapLibre 侧依据 | 在当前架构里的落点 | 说明 |
| --- | --- | --- | --- | --- |
| 地图加载、创建与销毁 | 直接实现 | `new Map({...})`、`remove()` | `AbstractMap.load()` / `mount()` / `destroy()` / `AbstractMapAdapter.createMap()` / `destroyMap()` | 当前 adapter 契约要求 `createMap()` 一次性吃下 `initialView`、`style`、`interactive`，这和 MapLibre 初始化方式完全顺手。 |
| 基础视角控制与视角读取 | 直接实现 | `jumpTo()`、`fitBounds()`、`getCenter()`、`getZoom()`、`getBounds()` | `AbstractMap.setView()` / `getView()` / `CameraState.center/zoom/bounds/padding` | `setView()` 只提出请求，`viewChanged` 由 adapter 在 MapLibre 真实相机变化后回灌。 |
| 单次视角过渡动画 | 直接实现 | `easeTo()`、`flyTo()`、`panTo()`、`zoomTo()` | `CameraTransition.animate/durationMs/easing` | 当前 `CameraTransition` 只覆盖了基础动画面，但简单动画已经可以直接落地。 |
| 旋转与倾斜 | 直接实现 | `setBearing()`、`setPitch()` | `MapCapability.camera.bearing`、`MapCapability.camera.pitch` | 这是当前 capability 和 MapLibre 最直连的一组能力。 |
| 地图运行时样式切换 | 直接实现 | `setStyle(style, options)` | `AbstractMap.patchMapOptions()` / `setStyle()` / `MapCapability.style.swap` | 相比旧版设计，core 现在已经有正式 map 级运行时配置更新入口，不再只是“初始 style”。 |
| `Source` 独立管理 | 直接实现 | `addSource()`、`getSource()`、`removeSource()` | `AbstractMap.addSource()` / `getSource()` / `removeSource()` / `SourceDefinition.engineExtensions?.maplibre.source` | 当前 `removeSource(..., { cascade: true })` 还能直接对齐 source-layer 依赖关系。 |
| Source 更新同步链路 | 直接实现 | `GeoJSONSource.setData()`、source 相关 API | `updated/dataChanged -> queueMicrotask -> adapter.updateSource()` | 当前 core 会把 `updated` 和 `dataChanged` 合并成一次 source 刷新，这对 MapLibre 的 source patch 很自然。 |
| `AbstractDataLayer` 独立管理 | 直接实现 | `addLayer()`、`moveLayer()`、`removeLayer()` | `AbstractMap.addLayer()` / `removeLayer()` / `DataLayerDefinition.engineExtensions?.maplibre.layer` | `sourceId / beforeId / layout / paint / filter / minZoom / maxZoom` 与 MapLibre style layer 非常贴近。 |
| GeoJSON 聚合 | 直接实现 | GeoJSON source 的 `cluster` 能力 | `SourceKind.geojson` / `MapCapability.cluster.geojson` | demo source 已把 `cluster` 放进 `options` 和 `engineExtensions.maplibre.source`。 |
| 屏幕投影与反投影 | 直接实现 | `project()`、`unproject()` | `AbstractMap.project()` / `unproject()` / `MapCapability.projection.screen` | 这部分与当前统一 API 基本一对一。 |
| Map 鼠标 / 触摸事件 | 直接实现 | `Map.on(type, listener)` | `events.map-mouse` / `events.map-touch` | 当前 core 已经把 map mouse 和 map touch 分开建模，MapLibre 原生事件面足够直接。 |
| Layer 鼠标 / 触摸事件 | 直接实现 | `Map.on(type, layerId, listener)` | `events.layer-mouse` / `events.layer-touch` | 需要注意当前 `LayerEventMap` 的 touch 只标准化了 `touchstart / touchend / touchcancel`，没有 `touchmove`。 |
| Marker / Popup / DOM overlay | 直接实现 | `Marker`、`Popup` 及 DOM bridge | `OverlayKind.marker`、`OverlayKind.popup`、`OverlayKind.custom` | 这是 MapLibre 最原生的 overlay 路径。 |
| Overlay mouse / touch / drag 事件 | 直接实现 | `Marker` 原生交互 + DOM overlay 事件 | `events.overlay-mouse` / `events.overlay-touch` / `events.overlay-drag` | `overlay-drag` 最稳的是 marker 类 overlay；当前 capability 表给的是 `native`，但不应外推到所有 overlay kind。 |
| 控件生命周期与自定义控件 | 直接实现 | `addControl()`、`removeControl()`、`IControl` | `AbstractMap.addControl()` / `removeControl()` / `ControlKind.custom` / `ControlSlot` | `ControlSlot` 四角位置与 MapLibre `ControlPosition` 基本完全同构。 |

## 4. 可以通过适配器桥接或额外约定实现的能力

| 能力 | 结论 | MapLibre 侧依据 | 当前建议落地方式 | 为什么不是“直接实现” |
| --- | --- | --- | --- | --- |
| `AbstractSystemLayer` 作为“命名系统层” | 可模拟实现 | MapLibre 没有统一的“平台系统层对象” | adapter 把 `systemKind` 翻译成命名 style fragment、保留 source/layer bundle，或约定一组预置层 | `AbstractSystemLayer` 是当前统一架构的抽象位，不是 MapLibre 原生对象分类。 |
| 矢量 `Overlay` 语义 | 可模拟实现 | MapLibre 的线面更适合走 source + layer；必要时也可走 custom render | adapter 把 `OverlayKind.polyline / polygon` 翻译成临时 source/layer，或收窄成自定义 overlay bridge | 当前 `AbstractOverlay` 是“对象式覆盖物”语义，而 MapLibre 的最佳表达通常是 layer。 |
| Map keyboard 事件 | 可模拟实现 | 容器 DOM 的 `keydown / keyup` | 对 mounted container 建立 DOM 监听，再桥接到 `events.keyboard` | 当前 `PseudoMapLibreAdapter` 也把这项明确标成了 `emulated`。 |
| `interactive` 等运行时交互开关 | 可模拟实现 | MapLibre 可以启停交互 handler，但没有一个完全统一的单开关对象模型 | 在 `patchMapOptions()` 里把 `interactive` 翻译成 handler enable/disable 策略 | core 已经给了 map 级运行时配置入口，但具体交互 handler 组合仍要 adapter 自己收口。 |

## 5. 当前架构下还做不到标准化接入的能力

| 能力 | 结论 | MapLibre 侧情况 | 为什么当前架构做不到 |
| --- | --- | --- | --- |
| 通用 `query.features` 公共 API | 当前架构下做不到标准化接入 | MapLibre 有 `queryRenderedFeatures()`、`querySourceFeatures()` | 当前 `MapCapability` 和 `PseudoMapLibreAdapter` 已把它标成 `native`，但 `AbstractMap` 还没有 `queryFeatures()` 之类的正式公共方法。 |
| 真正的 `terrain` 契约 | 当前架构下做不到标准化接入 | MapLibre 有 `setTerrain()`、`getTerrain()`、`queryTerrainElevation()` | 当前 core 只有 `MapCapability.terrain` 和 `SystemLayerKind.terrain` 这种槽位，没有 `TerrainDefinition`、地形 source 约束、elevation query 返回结构等正式模型。 |
| `feature-state` / 要素级状态管理 | 当前架构下做不到标准化接入 | MapLibre 有 `setFeatureState()`、`getFeatureState()`、`removeFeatureState()` | 当前 core 只有实体级 `patchOptions()`，没有 feature id、source-layer、state key 这类统一契约。 |
| `roll` / 投影切换 / globe / sky / fog | 当前架构下做不到标准化接入 | MapLibre 有 `setRoll()`、`setProjection()`、`setSky()`、`setFog()` 等 | 当前 `CameraState` 只覆盖 `center/zoom/bearing/pitch/bounds/padding`，没有这些更高阶场景参数的正式位置。 |
| sprite / image / glyph 管线 | 当前架构下做不到标准化接入 | MapLibre 有 `addImage()`、`updateImage()`、`setSprite()`、`setGlyphs()` | 当前统一对象体系里没有 `Image` / `Sprite` / `Glyph` 一等对象。 |
| 原生 `CustomLayerInterface` 渲染层 | 当前架构下做不到标准化接入 | MapLibre 支持自定义 WebGL 渲染层 | 当前 `DataLayerDefinition.engineExtensions?.maplibre.layer` 预留的是普通 `LayerSpecification` 扩展位，没有正式 custom render hook 契约。 |
| 完整的相机动画参数面 | 当前架构下做不到标准化接入 | MapLibre 的 `easeTo()` / `flyTo()` 还支持 `offset`、`around`、`curve`、`speed` 等 | 当前 `CameraTransition` 只有 `animate / durationMs / easing`，表达力还不够。 |

## 6. 与当前 capability 设计的一一对应

下面这张表直接对齐当前 `MapCapability` 与 `PseudoMapLibreAdapter` 的 `CapabilityDescriptor.level`，同时补上当前 core 的真实语义边界：

| 当前 capability | 当前 adapter 标记 | 结合当前 core 的解释 |
| --- | --- | --- |
| `camera.bearing` | `native` | 对应 `setBearing()`，并能装进 `CameraState.bearing` |
| `camera.pitch` | `native` | 对应 `setPitch()`，并能装进 `CameraState.pitch` |
| `style.swap` | `native` | 当前已经有 `patchMapOptions()` / `setStyle()` 正式入口，MapLibre 可以直接承接 |
| `source.management` | `native` | `addSource/getSource/removeSource` 与 `SourceDefinition.engineExtensions?.maplibre.source` 天然一致 |
| `layer.management` | `native` | `DataLayerDefinition.engineExtensions?.maplibre.layer`、`beforeId`、`sourceId` 与 MapLibre layer 模型天然一致；`system` layer 仍属于 adapter 解释层 |
| `overlay.dom` | `native` | `Marker` / `Popup` / DOM overlay 是原生能力 |
| `overlay.vector` | `native` | capability 表给的是 `native`，但如果坚持走对象式 `AbstractOverlay.polyline/polygon`，真实 adapter 仍常常会桥回 source/layer |
| `control.custom` | `native` | `IControl` 与 `ControlSlot` 基本一对一 |
| `projection.screen` | `native` | `project()` / `unproject()` 直接可用 |
| `events.map-mouse` | `native` | `MapEventMap` 已有完整 map mouse 事件名，MapLibre 可直接桥接 |
| `events.map-touch` | `native` | `MapEventMap` 已有完整 map touch 事件名，MapLibre 事件面也足够直接 |
| `events.layer-mouse` | `native` | layer-scoped mouse 事件天然匹配 |
| `events.layer-touch` | `native` | layer-scoped touch 事件可以归一，但当前 core 只标准化了 `touchstart / touchend / touchcancel` |
| `events.overlay-mouse` | `native` | Marker / Popup / DOM overlay 可桥接到 overlay mouse 事件 |
| `events.overlay-touch` | `native` | DOM overlay 与相关原生交互可桥接到 overlay touch 事件 |
| `events.overlay-drag` | `native` | marker 类 overlay 的拖拽能力最直接；不要把这个标记理解为所有 overlay kind 都原生可拖 |
| `events.keyboard` | `emulated` | 当前统一 keyboard 事件仍主要依赖容器 DOM bridge |
| `query.features` | `native` | 这是“引擎能力原生可用”的判断，不等于当前 `AbstractMap` 已经公开了标准查询方法 |
| `cluster.geojson` | `native` | GeoJSON source 的 cluster 语义与当前 `SourceKind.geojson` 直接兼容 |
| `terrain` | `emulated` | capability 只说明“adapter 可以尝试承接地形”，不等于 core 已经有完整 terrain 公共模型 |

## 7. 最务实的接入建议

如果你要把 MapLibre 正式接进这套架构，最稳的做法是：

1. 把 `Source + DataLayer` 当成主路径
   - 这是当前 core 与 MapLibre 对齐度最高的部分。
   - `engineExtensions.maplibre.source` 和 `engineExtensions.maplibre.layer` 已经明确给了 MapLibre 扩展位。

2. 把 `Overlay` 收窄给 `Marker / Popup / custom DOM`
   - 线、面、热力图、填充挤出等优先走 `AbstractDataLayer`。
   - 不要把 MapLibre 的 style layer 体系硬塞成对象式 overlay。

3. 把 `createMap()` 和 `patchMapOptions()` 当成唯一的地图状态入口
   - `createMap()` 负责首帧 `initialView/style/interactive`。
   - 运行期样式和交互开关统一走 `patchMapOptions()` / `setStyle()`，不要再发散出 adapter 私有主路径。

4. 对 `SystemLayer` 采用“命名层组”策略
   - 不要把 `traffic / satellite / roadnet / poi` 这种 provider 服务语义强塞给 MapLibre。
   - 如果要保留 `AbstractSystemLayer`，把它解释成命名 style fragment 或预置 source/layer bundle 更稳。

5. 输入事件按当前 capability 名拆开实现
   - `events.map-mouse / events.map-touch / events.layer-mouse / events.layer-touch / events.overlay-mouse / events.overlay-touch / events.overlay-drag` 都已经有正式 core 契约。
   - `events.keyboard` 继续按容器 DOM bridge 处理。
   - `events.layer-touch` 只承诺当前 core 已定义的三种 touch 事件，不要暗中扩成另一套语义。

6. 想正式开放 `query.features` 或 `terrain` 时，先补 core
   - `query.features` 先补 `AbstractMap` 公共方法和统一返回结构。
   - `terrain` 先补 `types.ts` 中的正式 terrain 定义、地形 source 约束和 elevation query 语义。

## 8. 参考资料

- MapLibre GL JS Map API: https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/
- MapLibre GL JS MapEventType: https://maplibre.org/maplibre-gl-js/docs/API/interfaces/MapEventType/
- MapLibre GL JS IControl: https://maplibre.org/maplibre-gl-js/docs/API/interfaces/IControl/
- MapLibre GL JS GeoJSONSource: https://maplibre.org/maplibre-gl-js/docs/API/classes/GeoJSONSource/
- MapLibre GL JS Popup: https://maplibre.org/maplibre-gl-js/docs/API/classes/Popup/
- 当前架构代码：
  - `src/unified-map/core/adapter.ts`
  - `src/unified-map/core/capability.ts`
  - `src/unified-map/core/control.ts`
  - `src/unified-map/core/entity.ts`
  - `src/unified-map/core/events.ts`
  - `src/unified-map/core/internal-events.ts`
  - `src/unified-map/core/internal-lifecycle.ts`
  - `src/unified-map/core/layer.ts`
  - `src/unified-map/core/map.ts`
  - `src/unified-map/core/overlay.ts`
  - `src/unified-map/core/source.ts`
  - `src/unified-map/core/types.ts`
  - `src/unified-map/pseudo/pseudo-adapters.ts`
