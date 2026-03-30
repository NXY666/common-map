# 百度地图在当前 unified-map 架构下的能力分类

本文档回答的问题是：

> 按照当前这套 `unified-map` 架构，百度地图 JSAPI WebGL 能直接实现什么、能通过组合或适配器模拟出什么、又有哪些能力在当前架构里还做不到标准化接入。

## 1. 判定口径

这里的“当前架构”特指你现在仓库中的这套抽象层，而不是更早期那版缺口较多的 core：

- `Map / Source / Layer / Overlay / Control / Adapter / Capability`
- `TypedEvented / MapEventMap / SourceEventMap / LayerEventMap / OverlayEventMap / ControlEventMap`
- `AbstractMap.load() -> mount() -> destroy()` 的地图生命周期
- `AbstractMapAdapter.createMap()` 必须一次性完成 `initialView`、`style`、`interactive` 等初始状态
- `AbstractMap.patchMapOptions()` / `setStyle()` 这条地图级运行时配置更新链路
- `MapEventBridge` 与 `emitFromAdapter()` 的 adapter-only 事件回灌约束
- `AbstractMapEntity` 的 `draft -> mounted -> disposed` 生命周期，以及 `Map` 对实体的托管约束
- `Source updated/dataChanged -> queueMicrotask -> adapter.updateSource()` 的 source 刷新合并逻辑
- `AbstractLayer / AbstractDataLayer / AbstractSystemLayer`
- `CameraState / CameraTransition / SourceDefinition / LayerDefinition / OverlayDefinition / ControlDefinition`
- 当前 `MapCapability` 能力集合
- 当前 `PseudoBMapGLAdapter` 已经体现出的判断方向

判定规则分三档：

- `直接实现`
  - 对应当前 capability profile 里的 `native`，或者 core 已经给了非常贴近百度原生模型的正式槽位。
  - 适配器基本可以一对一落地，不需要大规模“伪造”对象体系。
- `可模拟实现`
  - 对应当前 capability profile 里的 `emulated`，或者百度能做出类似效果，但当前统一语义与百度原生模型不完全同构。
  - adapter 往往要维护注册表、做 hit-test、DOM bridge、overlay group 翻译，或者收窄成较弱能力。
- `当前架构下做不到标准化接入`
  - 对应当前 capability profile 里的 `none`，或 core 标准 API 仍没有正式入口。
  - 不是说百度完全做不到，而是“当前统一 API 没有承载这项能力的正式位置”，或者百度原生语义本来就和当前统一模型不对等。

说明：

- 结论优先与你当前代码里的 `src/unified-map/core/*` 和 `src/unified-map/pseudo/pseudo-adapters.ts` 保持一致。
- 文中凡是写到“推断”的地方，都是基于百度原生 API 形态与你当前抽象层契合度做的工程判断，不是百度文档原文结论。
- 这份文档现在会明确区分三件事：
  - core 是否已经给了正式公共槽位
  - `PseudoBMapGLAdapter` 当前把这项 capability 标成了什么
  - 真实 BMapGL adapter 落地时，需要多少翻译和补账本

## 2. 总结结论

一句话总结：

- 当前 core 相比早期版本已经把 BMapGL 接入需要的基础骨架补齐了：`load -> mount`、`createMap()` 负责初始视角、`patchMapOptions()/setStyle()`、严格的事件 bridge、正式的 mouse/touch/keyboard 事件名、`AbstractSystemLayer` 槽位，这些都已经落地。
- `Map` 的基础生命周期、基础视角、投影换算、覆盖物、控件、map mouse 事件，百度地图都能比较直接地接进来。
- 真正需要适配器重翻译的重点现在集中在：
  - `Source` 的逻辑注册与刷新
  - `AbstractDataLayer` 的渲染翻译
  - `style.swap`
  - `touch / keyboard` 和 layer 命中事件桥接
  - `cluster.geojson`
- 仍然不适合纳入当前统一标准 API 的，是 `query.features`、真正的 `terrain`、搜索/路线/编码/定位等服务类能力，以及右键菜单、截图、Track 插件一类平台特有能力。

## 3. 直接实现的能力

| 能力 | 结论 | 百度侧依据 | 在当前架构里的落点 | 说明 |
| --- | --- | --- | --- | --- |
| 地图加载、创建与销毁 | 直接实现 | `new BMapGL.Map(...)`、初始化视角、`destroy()` | `AbstractMap.load()` / `mount()` / `destroy()` / `AbstractMapAdapter.createMap()` / `destroyMap()` | 当前 adapter 契约已经明确要求 `createMap()` 负责首帧 `initialView/style/interactive`，这与百度初始化流程是兼容的。 |
| 基础视角控制与视角读取 | 直接实现 | `centerAndZoom`、`setCenter`、`setZoom`、`setViewport`、`getViewport` | `AbstractMap.setView()` / `getView()` / `CameraState.center/zoom/bounds/padding` | 对不带复杂关键帧的视角更新，百度原生 setter 足够直接。 |
| 旋转与倾斜 | 直接实现 | `setHeading()`、`setTilt()` | `MapCapability.camera.bearing`、`MapCapability.camera.pitch` | 这部分和当前能力枚举完全对齐。 |
| 屏幕投影与反投影 | 直接实现 | `pointToPixel()`、`pixelToPoint()`、`pointToOverlayPixel()`、`overlayPixelToPoint()` | `AbstractMap.project()` / `unproject()` / `MapCapability.projection.screen` | 这是统一 API 中最适合跨引擎收口的能力之一。 |
| 覆盖物生命周期 | 直接实现 | `addOverlay()`、`removeOverlay()`、`clearOverlays()` | `AbstractMap.addOverlay()` / `removeOverlay()` / adapter 的 `mountOverlay()` 流程 | 当前 `Overlay` 的托管语义和百度原生 Overlay 十分接近。 |
| 点标记 / 弹窗 / 矢量覆盖物 / 自定义覆盖物 | 直接实现 | `Marker`、`InfoWindow`、`Polyline`、`Polygon`、`CustomOverlay` | `OverlayKind.marker`、`popup`、`polyline`、`polygon`、`custom` | 当前 `OverlayKind` 与百度常用覆盖物形态是对得上的。 |
| 控件生命周期 | 直接实现 | `addControl()`、`removeControl()` | `AbstractMap.addControl()` / `removeControl()` / adapter 的 `mountControl()` 流程 | 和覆盖物一样，百度原生模型与当前架构非常贴近。 |
| 导航 / 比例尺 / 自定义控件 | 直接实现 | `NavigationControl3D`、`ScaleControl`、`Control.initialize()` | `ControlKind.navigation`、`ControlKind.scale`、`ControlKind.custom` | `ControlSlot` 四角定位正好可以收口百度控件锚点。 |
| Map 鼠标事件 | 直接实现 | map 的 `click / dblclick / rightclick / mousedown / mouseup / mousemove / mouseover / mouseout` | `events.map-mouse` | 这部分在当前 capability 表里也是 `native`。 |

## 4. 需要显式桥接或分级处理的能力

| 能力 | 结论 | 百度侧依据 | 当前建议落地方式 | 实现边界 / 说明 |
| --- | --- | --- | --- | --- |
| `Source` 独立管理 | 可模拟实现 | 百度没有 MapLibre 风格一等 `addSource/removeSource` | adapter 内维护 `sourceRegistry`，把 Source 当成逻辑数据仓库 | 当前 `PseudoBMapGLAdapter` 也是按 `registerLogicalSource()` 这种账本模型来表达。 |
| `AbstractDataLayer` 独立管理 | 可模拟实现 | `NormalLayer`、`FeatureLayer`、`PointIconLayer`、`LineLayer`、`FillLayer` 等能力与统一模型并不一一对应 | adapter 把统一数据层翻译成百度 layer、overlay group，或两者混用 | `layer.management` 在 capability 表里之所以是 `emulated`，核心原因就在这里。 |
| GeoJSON Source + 点/线/面数据渲染 | 可模拟实现 | `FeatureLayer.setData()` 及相关图层/覆盖物能力 | `Source` 放在 adapter 账本里，`AbstractDataLayer` 决定翻译成哪类百度对象 | 能做，但不是一个 `sourceId -> 原生 source` 的直连映射。 |
| `AbstractSystemLayer` 的具体 `systemKind` 支持 | 可模拟实现 | `traffic / satellite / roadnet` 等有较直接入口，其他子类能力不完全对等 | 对支持的 `systemKind` 做直连映射，对不支持的子类明确裁剪 | core 已经有正式 `AbstractSystemLayer` 槽位，但 `SystemLayerKind` 枚举比百度稳定原生子集更宽。 |
| 样式切换 | 可模拟实现 | `setMapStyle()`、`setMapStyleV2()` | 把 `patchMapOptions({ style })` / `setStyle()` 收窄为百度样式预设、`styleId` 或 `styleJson` | 现在 core 已有正式 map 级运行时入口，但百度侧仍不是通用 style-spec 模型。 |
| 单次视角过渡动画 | 可模拟实现 | `ViewAnimation`、`startViewAnimation()`，以及部分 setter 自带平滑行为 | 无动画时走 `centerAndZoom / setCenter / setZoom / setViewport`，需要动画时统一收口到 `ViewAnimation` | 百度“动画相机”的主模型更接近关键帧，而不是通用 camera options。 |
| GeoJSON 聚合 | 可模拟实现 | 聚合插件或 adapter 预聚合 | 使用百度聚合能力或 adapter 预处理后生成 marker / point layer 批次 | 能承诺“有聚合效果”，但不要承诺和 MapLibre 完全同构。 |
| Map touch / keyboard 事件 | 可模拟实现 | 容器 DOM 可监听 touch、keyboard 事件 | 通过 mounted container bridge 到 `events.map-touch`、`events.keyboard` | 当前 capability 表对这两项都是 `emulated`。 |
| Layer 鼠标 / touch 事件 | 可模拟实现 | layer 事件、picked-item、hit-test 能力 | 对可命中的 layer 维护命中测试与 feature payload 归一 | 需要注意当前 `LayerEventMap` 的 touch 只标准化了 `touchstart / touchend / touchcancel`。 |
| Overlay 输入事件 | 分级支持 | overlay 的 `addEventListener()`、DOM、自定义包装层 | `mouse` 尽量直连，`touch` 和 `drag` 按 overlay kind 分级承诺 | `drag` 最稳的是 marker 类 overlay，其余类型不要过度承诺。 |

## 5. 当前架构下做不到的能力

| 能力 | 结论 | 百度侧情况 | 为什么当前架构做不到 |
| --- | --- | --- | --- |
| 通用 `query.features` | 当前架构下做不到 | 百度有 picked-item 和局部命中能力，但没有 MapLibre 风格统一渲染要素查询接口 | 当前 `PseudoBMapGLAdapter` 已把 `query.features` 标成 `none`，而 `AbstractMap` 也没有正式 `queryFeatures()` API。 |
| 真正的 `terrain` / 地形能力 | 当前架构下做不到 | 百度 WebGL 没有与你当前 `terrain` 语义严格对等的稳定公共模型 | `SystemLayerKind.terrain` 只是枚举位，不代表已有可用的统一 terrain contract；当前 capability 也明确是 `none`。 |
| 多关键帧视角动画的标准化表达 | 当前架构下做不到 | 百度有 `ViewAnimation` / `ViewAnimationKeyFrames` | 当前 `CameraTransition` 只有 `animate / durationMs / easing`，没有关键帧、循环、延迟等正式槽位。 |
| 右键菜单 | 当前架构下做不到 | 百度有 `ContextMenu` / `MenuItem` | 当前架构没有 `Menu` 这一类一等对象，也没有统一的地图上下文菜单模型。 |
| 地图截图 | 当前架构下做不到 | 百度有 `getMapScreenshot()`，且要求特定底层配置 | 当前 `UnifiedMapOptions` 和 `AbstractMap` 没有 screenshot / preserveDrawingBuffer 相关标准入口。 |
| 底图热点 / 底图标签 / 区域热点 | 当前架构下做不到 | 百度有 `addSpots()`、`addLabelsToMapTile()`、`highlightSpotByUid()` 等能力 | 这些都不是当前 `Source / Layer / Overlay / Control` 体系中的标准对象。 |
| 检索与服务类能力 | 当前架构下做不到 | 百度有 `LocalSearch`、`DrivingRoute`、`WalkingRoute`、`TransitRoute`、`Geocoder`、`Geolocation`、`Autocomplete`、`Boundary` | 当前架构是“渲染与交互 core”，不是“服务 API core”。 |
| Track / Cruise / Scene 插件 | 当前架构下做不到 | 百度有轨迹、巡航、场景类插件能力 | 当前统一对象体系没有对应模块。 |

## 6. 与当前 capability 设计的一一对应

下面这张表，直接对齐当前 `MapCapability` 和 `PseudoBMapGLAdapter` 里的 `CapabilityDescriptor.level`，也顺便标出它和 core 契约的关系：

| 当前 capability | 当前 adapter 标记 | 结合当前 core 的解释 |
| --- | --- | --- |
| `camera.bearing` | `native` | 对应 `setHeading()`，并能装进 `CameraState.bearing` |
| `camera.pitch` | `native` | 对应 `setTilt()`，并能装进 `CameraState.pitch` |
| `style.swap` | `emulated` | 当前已经有 `patchMapOptions()` / `setStyle()` 正式入口，但百度实现仍要收窄成样式预设或 `styleId/styleJson` |
| `source.management` | `emulated` | 需要 adapter 账本，不是百度原生 source API；还要配合当前 `removeSource(..., { cascade: true })` 的依赖约束 |
| `layer.management` | `emulated` | 数据层仍需翻译；系统层虽然已有正式抽象位，但 concrete `systemKind` 仍要按百度子集裁剪 |
| `overlay.dom` | `native` | `CustomOverlay` / `InfoWindow` / DOM 承载能力都比较顺手 |
| `overlay.vector` | `native` | 当前 `OverlayKind.polyline / polygon` 与百度原生覆盖物模型基本对得上 |
| `control.custom` | `native` | `Control.initialize()` + `addControl()` 与当前控制模型很贴近 |
| `projection.screen` | `native` | `pointToPixel()` / `pixelToPoint()` 可直接承接 |
| `events.map-mouse` | `native` | core 已有 map mouse 事件名，BMapGL map 事件可直接归一桥接 |
| `events.map-touch` | `emulated` | core 已有 map touch 事件名，但 BMapGL WebGL 更稳的做法仍是容器 DOM bridge |
| `events.layer-mouse` | `emulated` | core 已有 layer mouse 事件名；BMapGL 需依赖 layer 事件或 picked-item 命中测试 |
| `events.layer-touch` | `emulated` | core 已有 layer touch 事件名，但主要靠 hit-test 模拟；而且当前 core 不包含 `touchmove` |
| `events.overlay-mouse` | `native` | 多数百度 overlay 可直接监听 mouse 事件 |
| `events.overlay-touch` | `emulated` | 触摸桥接更多依赖 DOM 或 adapter 包装层 |
| `events.overlay-drag` | `emulated` | marker 类 overlay 最直接，其他 overlay kind 需要分级支持 |
| `events.keyboard` | `emulated` | 当前统一 keyboard 事件应走容器 DOM，而不是期待百度回调自己提供完全对等语义 |
| `query.features` | `none` | 没有可对齐当前统一语义的公共 query API |
| `cluster.geojson` | `emulated` | 通过插件或 adapter 预聚合实现“聚合效果”，不是 Source 级天然能力 |
| `terrain` | `none` | 当前 capability 已明确判定不支持，不应把 `SystemLayerKind.terrain` 误解成已经可用 |

## 7. 最务实的接入建议

如果你现在就要把百度地图正式接进这套架构，建议按这个顺序做：

1. 先做 `Map + View + Projection + Overlay + Control`
   - 这部分最稳，百度原生接口和你当前抽象层最贴近。
   - `createMap()` 直接吃下首帧 `initialView/style/interactive`，不要再拆出第二条初始化路径。

2. 再做 `Source + DataLayer + SystemLayer` 的“逻辑注册 + 渲染翻译”
   - `Source` 先做 adapter 内账本。
   - `DataLayer` 先支持最小闭环，再逐步扩展图层类型。
   - `SystemLayer` 先只接稳定子集，不要一次承诺整个 `SystemLayerKind` 枚举。

3. 把地图运行时配置统一收口到 `patchMapOptions()` / `setStyle()`
   - 不要另外发明一套 BMap 私有的“样式主入口”。
   - 统一入口在 core，百度侧只负责把它翻译成 `setMapStyle()` 或 `setMapStyleV2()`。

4. 视角切换分成“无动画”和“有动画”两条路径
   - 不带动画时，直接用百度基础 setter。
   - 只要需要动画，优先统一走 `ViewAnimation`，不要把若干零散平滑行为拼成主实现。

5. `mouse / touch / keyboard` 事件按当前 capability 逐类桥接
   - `events.map-mouse` 和 `events.overlay-mouse` 优先，因为它们最接近百度原生事件面。
   - `events.map-touch`、`events.keyboard` 统一走容器 DOM bridge。
   - `events.layer-touch` 只承诺当前 core 已定义的 touch 事件子集，不要扩成另一套私有协议。

6. 对 `query.features`、`terrain`、服务类能力保持克制
   - `query.features` 当前就按 `none` 处理，不要硬凑一个名义兼容层。
   - `terrain` 当前也不要因为枚举里有 `terrain` 就做出“已支持”的结论。
   - 搜索、路径、地理编码、定位建议以后单独做 `service/` 模块，而不是继续塞进渲染 core。

## 8. 结论

站在当前代码状态看，你这套架构接百度地图是可行的，而且比之前更清楚：

- core 已经把 `load/mount`、map 运行时更新、输入事件槽位、实体托管、source 刷新合并这些基础契约补齐了。
- 现在真正的难点，已经不再是“core 缺不缺口”，而是 BMapGL adapter 该如何翻译 `Source / DataLayer / SystemLayer` 和命中事件。
- 最自然的部分仍然是 `Map`、`Overlay`、`Control`。
- 最需要适配器账本和分级承诺的部分，仍然是 `Source`、`AbstractDataLayer`、`style.swap`、`layer/overlay touch`、`cluster.geojson`。
- `query.features`、`terrain`、服务类能力则应该继续明确留在统一渲染抽象之外。

所以最合理的边界仍然是：

- 把百度地图先接成一个“地图渲染与交互适配器”。
- 暂时不要把百度整套平台生态都抽成通用标准 API。

## 9. 参考资料

- 百度地图 JSAPI WebGL v1.0 类参考：https://mapopen-pub-jsapi.bj.bcebos.com/jsapi/reference/jsapi_webgl_1_0.html
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
