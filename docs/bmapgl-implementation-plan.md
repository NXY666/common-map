# BMapGL 完整实现方案

这份文档不是能力盘点，而是面向落地开发的实现蓝图。目标是在当前 `unified-map` 骨架上，给出一套可以真实接入百度地图 JSAPI WebGL 的方案，并明确哪些点要先改 core，哪些点可以先在 `bmapgl` 适配层内部消化。

关联文档：

- `docs/bmapgl-capability-matrix.md`
- `docs/unified-map-api-guide.md`

官方参考：

- 百度地图 JSAPI WebGL 类参考：https://mapopen-pub-jsapi.bj.bcebos.com/jsapi/reference/jsapi_webgl_1_0.html

## 1. 目标与边界

本次 BMapGL 接入的目标是把百度地图接成一个“统一渲染与交互适配器”，而不是把百度整套服务生态都抽象进统一 API。

纳入本期的能力：

- 地图创建与销毁
- 视角控制、投影换算
- Source 的逻辑注册与数据更新
- DataLayer / SystemLayer 的挂载、刷新、卸载
- Overlay / Control 的完整生命周期
- 样式切换、mouse/touch/keyboard 事件的 BMapGL 适配

明确不纳入统一标准 API 的能力：

- 搜索、路径规划、地理编码、定位
- 右键菜单
- 地图截图
- Track / Cruise / Scene 插件
- Earth mode / terrain 的统一控制

## 2. 当前架构里必须先看清的三个问题

`load()`、source 刷新链路、基础事件槽位这些之前卡住 BMapGL 的点，现在大体已经补上了。重新看当前 core，真正还会影响实现边界的，已经变成下面三个问题。

### 2.1 初始视角的职责现在是分裂的：`createMap()` 和 `mount()` 都在动相机

当前 `AbstractMap.mount()` 的流程是：

1. `adapter.createMap(...)`
2. 立刻再调一次
   - `adapter.setView(nativeMap, options.initialView, { animate: false })`

但 `AbstractMapAdapter.createMap(...)` 同时又拿到了完整 `UnifiedMapOptions`，而 BMapGL 的 `new BMapGL.Map(...)` 之后通常还必须立刻 `centerAndZoom(...)` 才算真正初始化完成。

这会导致一个很具体的问题：

- 如果 adapter 按 BMapGL 原生语义在 `createMap()` 里完成首帧相机初始化，core 还会在 `mount()` 里再补打一轮 `setView(initialView)`。
- 如果 adapter 为了规避双调而把初始化相机完全挪出 `createMap()`，又会和 BMapGL 的原生初始化顺序拧巴。

这件事需要先收口成一个单一契约。合理做法有两个方向：

1. `createMap()` 只负责创建原生 map 和 runtime，不做任何初始相机设置；`mount()` 里的 `setView(initialView)` 保持唯一入口。
2. `createMap()` 负责完成初始相机初始化；core 移除 `mount()` 里的那次 `setView(initialView)`。

对 BMapGL 来说，第二种更自然，因为百度要求先 `centerAndZoom(...)` 才能把地图真正初始化起来。

### 2.2 `viewChanged` 的事件语义还没有真正收口

当前 core 已经有了：

- `MapEventBridge`
- `mouse / touch / keyboard` 事件契约
- `viewChanged.reason / inputType`

但 `AbstractMap.setView()` 里仍然会在调用完 `adapter.setView(...)` 后，直接 `fire("viewChanged", ...)`。

这会和后续真正的 native 事件桥接发生冲突：

- API 调用会先乐观触发一次 `viewChanged`
- adapter 监听到真实的视角变化后，通常还会再桥接一次 `viewChanged`
- 如果是动画、bounds fitting、或引擎内部纠偏，第一次事件里的 `view` 还是“请求值”，不是“真实值”

所以现在的问题已经不是“有没有统一事件面”，而是“`viewChanged` 到底表示什么”。

更合理的收口方式是：

1. `viewChanged` 只表示“地图真实视角已经变化”，统一由 adapter bridge 在 native 变化后回灌。
2. 如果还需要表达“业务刚刚发起了一次视角请求”，另起一个事件名，比如 `viewRequested` / `viewWillChange`，不要复用 `viewChanged`。

否则 BMapGL 一旦把 map move / zoom / animation 事件认真桥进来，当前 core 会天然双发。

### 2.3 core 还缺 map 自身的可变配置更新链路

现在 `Source / Layer / Overlay / Control` 都有自己的“对象状态 -> `updated` 事件 -> `adapter.updateXxx()`”链路，但 `Map` 本身只有：

- 构造期 `UnifiedMapOptions`
- 运行期 `setView() / getView() / project() / unproject()`

这意味着地图级别的可变配置目前没有统一更新入口，例如：

- `style.swap`
- `interactive` 开关
- 百度特有但又值得统一抽象的 display options

现在 `UnifiedMapOptions.style` 只是初始值，不是运行时 API；`style.swap` 这个 capability 在 core 里其实还停留在“声明存在”，没有配套标准调用面。

如果这一点不先补，BMapGL 只能把样式切换做成 adapter 私有能力，而不是 `unified-map` 的标准能力。

更合理的做法是：

1. 在 `AbstractMap` 增加 map 级更新入口，例如 `setStyle()` 或 `patchMapOptions()`
2. 在 `AbstractMapAdapter` 增加对应 hook，例如 `setStyle(...)` 或 `updateMapOptions(...)`
3. 视需要补一个 map 级变更事件，而不是继续把所有运行期 map 行为都塞进 `setView()`

### 2.4 补充：两个次级风险

这两个点不是当前第一优先级 blocker，但在真实 adapter 落地时会碰到：

- `mount()` / `addXxx()` 失败时没有回滚语义
  - 一旦 `mountLayer()` 或 `mountOverlay()` 中途抛错，前面已经 materialize 的对象不会自动撤回，容易留下半挂载状态。
- `MapEventBridge` 当前暴露的是整个 `MapEventMap`
  - 这意味着 adapter 理论上也能发 `mounted / destroyed / sourceAdded` 这类本该由 core 负责的生命周期事件；后续最好把它收窄成“视角 + 交互”专用桥。

## 3. 推荐的模块结构

建议新增一个真实的 `bmapgl` 模块，而不是继续往 `pseudo/` 里塞逻辑：

```text
src/unified-map/
  bmapgl/
    adapter.ts
    loader.ts
    runtime.ts
    types.ts
    events.ts
    capabilities.ts
    utils/
      coords.ts
      style.ts
      guards.ts
    translators/
      view.ts
      source.ts
      layer.ts
      overlay.ts
      control.ts
    bridges/
      custom-overlay.ts
      custom-control.ts
      input-events.ts
```

职责划分：

- `loader.ts`
  - 负责脚本加载、AK 配置、全局单例缓存
- `runtime.ts`
  - 定义适配器内部运行时句柄与注册表
- `capabilities.ts`
  - 输出真实 `StaticCapabilityProfile`
- `adapter.ts`
  - `BMapGLAdapter` 主体，实现 `AbstractMapAdapter`
- `translators/*`
  - 负责统一定义到 BMapGL 原生对象的翻译
- `bridges/*`
  - 负责 `CustomOverlay` / `Control` / input event 这种桥接逻辑

## 4. 运行时句柄设计

真实 BMapGL 适配器不能只保存 `BMapGL.Map`，必须维护完整账本。

建议运行时定义如下：

```ts
export interface BMapGLRuntime {
  api: typeof BMapGL;
  map: BMapGL.Map;
  sourceRegistry: Map<string, BMapSourceRecord>;
  layerRegistry: Map<string, BMapLayerRecord>;
  sourceToLayerIds: Map<string, Set<string>>;
  overlayRegistry: Map<string, BMapOverlayRecord>;
  controlRegistry: Map<string, BMapControlRecord>;
  mapEventDisposers: Array<() => void>;
  activeViewAnimation?: BMapGL.ViewAnimation;
}
```

其中：

- `sourceRegistry`
  - 保存逻辑 source、原始 definition、标准化 GeoJSON、依赖图层列表
- `layerRegistry`
  - 保存 data layer / system layer 的原生句柄、翻译策略、刷新函数
- `overlayRegistry`
  - 保存 `Marker / Polyline / Polygon / InfoWindow / CustomOverlay`
- `controlRegistry`
  - 保存 `NavigationControl3D / ScaleControl / 自定义控件桥接实例`

每类 record 都建议至少包含：

- `definition`
- `kind`
- `nativeHandle`
- `dispose()`
- `sync(nextDefinition)`

这样 `updateXxx()` 可以统一走 `record.sync()`，不需要在 adapter 主类里堆满分支。

## 5. Loader 方案

### 5.1 推荐 API

```ts
await map.load();
map.mount();
```

设计要求：

- `map.load()` 必须幂等
- 对同一 adapter 的重复加载应复用同一个 Promise
- 脚本已存在时直接复用全局 `window.BMapGL`
- 加载失败后应允许再次重试 `load()`
- `load()` 完成前不允许 `mount()`

### 5.2 不建议把 AK 写进 `UnifiedMapOptions`

`UnifiedMapOptions` 是跨引擎公共模型；AK、脚本版本、插件列表都属于百度适配器自己的基础设施，不应该污染 core。

更合理的方式是：

- 在 adapter 内部维护 loader 配置
- 业务统一调用 `await map.load()`
- 再调用 `map.mount()`

## 6. `BMapGLAdapter` 的总体职责

`BMapGLAdapter` 只做四件事：

1. 创建和维护 `BMapGLRuntime`
2. 把统一 Definition 翻译成百度原生对象
3. 在 source、layer、overlay、control 变化时做增量同步
4. 在 core 补齐后，同步 map 级可变配置，例如 style / interactive / display options

建议类签名：

```ts
export class BMapGLAdapter extends AbstractMapAdapter {
  public readonly engine = "bmapgl";

  public constructor(options?: BMapGLAdapterOptions) {
    super(createBMapGLCapabilityProfile());
  }
}
```

`BMapGLAdapterOptions` 只放适配层自己的默认行为，例如：

- 默认点坐标系
- 是否优先使用 `GeoJSONLayer`
- 是否启用 layer 事件桥接
- 是否自动桥接 map mouse/touch/keyboard 事件

## 7. 按 Adapter 方法展开的具体实现逻辑

这一节只回答一个问题：`AbstractMapAdapter` 里的每个关键方法，在 BMapGL 中到底应该按什么顺序调用什么 API。

### 7.1 `createMap(target, options, eventBridge)`

这里先约定一个前提：下文按“`createMap()` 自己完成初始相机初始化，core 不再在 `mount()` 里重复 `setView(initialView)`”来描述。如果 core 暂时保留当前双重初始化，那么下面第 5 到第 8 步只能视为首轮初始化，`mount()` 之后还会再补打一轮相机 setter。

推荐实现顺序：

1. 读取全局 `window.BMapGL`
   - 如果不存在，直接抛错，提示业务先调用 `ensureBMapGLReady()`
2. 解析 `target.container`
   - 字符串时 `document.querySelector(...)`
   - 节点时直接使用
3. 组装 `MapOptions`
   - `enableAutoResize`
   - `minZoom / maxZoom`
   - `mapType`
   - `displayOptions`
   - 这些都应来自 adapter 自己的 options，而不是直接污染 `UnifiedMapOptions`
4. 创建地图实例
   - `const map = new BMapGL.Map(container, mapOptions)`
5. 把 `initialView.center` 转成 `new BMapGL.Point(lng, lat)`
6. 调用初始化视角
   - `map.centerAndZoom(point, options.initialView.zoom)`
7. 如果有 bearing，调用
   - `map.setHeading(options.initialView.bearing)`
8. 如果有 pitch，调用
   - `map.setTilt(options.initialView.pitch)`
9. 按 `interactive` 开关批量设置交互
   - 开启时：
     - `map.enableDragging()`
     - `map.enableScrollWheelZoom()`
     - `map.enableDoubleClickZoom()`
     - `map.enableKeyboard()`
     - `map.enablePinchToZoom()`
   - 关闭时：
     - `map.disableDragging()`
     - `map.disableScrollWheelZoom()`
     - `map.disableDoubleClickZoom()`
     - `map.disableKeyboard()`
     - `map.disablePinchToZoom()`
10. 如果有百度样式配置，调用
    - `map.setMapStyleV2({ styleId })`
    - 或 `map.setMapStyleV2({ styleJson, version })`
11. 如果需要系统显示项初始值，调用
    - `map.setDisplayOptions({ ... })`
12. 创建 runtime，并初始化空注册表
13. 绑定 map 级输入与视角事件
14. 返回 runtime

建议伪代码：

```ts
public createMap(
  target: MapMountTarget,
  options: Readonly<UnifiedMapOptions>,
  eventBridge: MapEventBridge,
): BMapGLRuntime {
  const api = assertBMapGLReady();
  const container = resolveContainer(target.container);
  const map = new api.Map(container, resolveMapOptions(this.options));
  const center = toBMapPoint(api, options.initialView.center);

  map.centerAndZoom(center, options.initialView.zoom);

  if (options.initialView.bearing != null) {
    map.setHeading(options.initialView.bearing);
  }

  if (options.initialView.pitch != null) {
    map.setTilt(options.initialView.pitch);
  }

  applyInteractive(map, options.interactive ?? true);
  applyInitialStyle(map, options.style, this.options);
  applyInitialDisplayOptions(map, this.options.displayOptions);

  const runtime = createRuntime(api, map, options.initialView);
  runtime.mapEventDisposers.push(...bindInputEvents(runtime, eventBridge));
  return runtime;
}
```

实现注意：

- 官方类参考明确写了 `new BMapGL.Map(...)` 之后还需要 `centerAndZoom(...)` 才算初始化完成。
- `getHeading()` / `getTilt()` 没有在参考页方法表和本地类型定义里稳定出现，所以 runtime 里必须维护 `cameraCache`，不要假定能从地图实例反读回来。

### 7.2 `destroyMap(runtime)`

`AbstractMap.destroy()` 已经先调用了 `unmountControl -> unmountOverlay -> unmountLayer -> unmountSource`，所以 adapter 的 `destroyMap()` 不需要再做整张地图的业务对象清理，只做 runtime 收口。

推荐实现顺序：

1. 如果有正在执行的动画
   - `map.cancelViewAnimation(runtime.activeViewAnimation)`
2. 解绑所有 map 级事件
3. 清空 runtime 注册表
4. 调用
   - `map.destroy()`

建议伪代码：

```ts
public destroyMap(mapHandle: unknown): void {
  const runtime = mapHandle as BMapGLRuntime;

  if (runtime.activeViewAnimation) {
    runtime.map.cancelViewAnimation(runtime.activeViewAnimation);
    runtime.activeViewAnimation = undefined;
  }

  for (const dispose of runtime.mapEventDisposers) {
    dispose();
  }

  runtime.sourceRegistry.clear();
  runtime.layerRegistry.clear();
  runtime.sourceToLayerIds.clear();
  runtime.overlayRegistry.clear();
  runtime.controlRegistry.clear();

  runtime.map.destroy();
}
```

### 7.3 `setView(runtime, view, transition)`

这里要把“有无动画”“是否传 bounds”明确拆开。

#### 7.3.1 无动画

推荐顺序：

1. 把 `center` 或 `bounds` 转成 `BMapGL.Point`
2. 如果传了 `bounds`
   - 组装点数组或 `Viewport`
   - 调用 `map.setViewport(points, { margins, noAnimation: true })`
3. 否则如果同时有 `center + zoom`
   - 调用 `map.centerAndZoom(point, zoom)`
4. 否则如果只改中心点
   - 调用 `map.panTo(point, { noAnimation: true })` 或直接 `centerAndZoom(point, currentZoom)`
   - 为了统一行为，推荐直接走 `centerAndZoom(point, currentZoom)`
5. 否则如果只改 zoom
   - 直接 `centerAndZoom(currentCenter, zoom)`
6. 如果 bearing 有值
   - `map.setHeading(view.bearing)`
7. 如果 pitch 有值
   - `map.setTilt(view.pitch)`
8. 更新 `runtime.cameraCache`

#### 7.3.2 有动画

推荐顺序：

1. 如果存在旧动画，先
   - `map.cancelViewAnimation(runtime.activeViewAnimation)`
2. 读取当前相机状态
   - `center` 用 `map.getCenter()`
   - `zoom` 用 `map.getZoom()`
   - `bearing/pitch` 用 `runtime.cameraCache`
3. 构造两个关键帧
   - 第一帧 `percentage: 0`
   - 第二帧 `percentage: 1`
4. 创建动画
   - `new BMapGL.ViewAnimation(keyFrames, { duration, delay: 0, interation: 1 })`
5. 启动动画
   - `map.startViewAnimation(animation)`
6. 保存 `runtime.activeViewAnimation = animation`
7. 更新 `runtime.cameraCache`

建议伪代码：

```ts
public setView(mapHandle: unknown, view: CameraState, transition?: CameraTransition): void {
  const runtime = mapHandle as BMapGLRuntime;
  const map = runtime.map;

  if (transition?.animate !== true) {
    applyImmediateView(runtime, view);
    return;
  }

  if (runtime.activeViewAnimation) {
    map.cancelViewAnimation(runtime.activeViewAnimation);
  }

  const currentCenter = map.getCenter();
  const currentZoom = map.getZoom();
  const animation = new runtime.api.ViewAnimation(
    [
      {
        center: currentCenter,
        zoom: currentZoom,
        heading: runtime.cameraCache.bearing,
        tilt: runtime.cameraCache.pitch,
        percentage: 0,
      },
      {
        center: toBMapPoint(runtime.api, view.center),
        zoom: view.zoom,
        heading: view.bearing ?? runtime.cameraCache.bearing,
        tilt: view.pitch ?? runtime.cameraCache.pitch,
        percentage: 1,
      },
    ],
    {
      delay: 0,
      duration: transition.durationMs ?? 1000,
      interation: 1,
    },
  );

  map.startViewAnimation(animation);
  runtime.activeViewAnimation = animation;
  updateCameraCache(runtime, view);
}
```

### 7.4 `getView(runtime)`

推荐实现顺序：

1. `const center = map.getCenter()`
2. `const zoom = map.getZoom()`
3. `const bounds = map.getBounds()`
4. `bearing/pitch` 不从 map 反读，直接用 `runtime.cameraCache`
5. 组装并返回统一 `CameraState`

```ts
public getView(mapHandle: unknown): CameraState {
  const runtime = mapHandle as BMapGLRuntime;
  const center = runtime.map.getCenter();
  const bounds = runtime.map.getBounds();

  return {
    center: [center.lng, center.lat],
    zoom: runtime.map.getZoom(),
    bearing: runtime.cameraCache.bearing,
    pitch: runtime.cameraCache.pitch,
    bounds: boundsToLiteral(bounds),
  };
}
```

### 7.5 `project(runtime, lngLat)` / `unproject(runtime, point)`

调用序列非常直接：

- `project`
  1. `new BMapGL.Point(lng, lat)`
  2. `map.pointToPixel(point)`
  3. 返回 `{ x, y }`

- `unproject`
  1. `new BMapGL.Pixel(x, y)`
  2. `map.pixelToPoint(pixel)`
  3. 返回 `{ lng, lat }`

## 8. Source 的具体实现逻辑

### 8.1 设计原则

在 BMapGL 中，`Source` 不是一等原生对象，所以统一 `Source` 应当被实现成“适配器内部的数据注册表”。

推荐 `BMapSourceRecord`：

```ts
interface BMapSourceRecord {
  id: string;
  definition: SourceDefinition;
  normalizedData?: GeoJSON.FeatureCollection;
  dependentLayerIds: Set<string>;
}
```

### 8.2 `mountSource(runtime, source)`

调用顺序：

1. `const definition = source.toSourceDefinition()`
2. 校验 `definition.kind`
   - 首版只正式支持 `geojson`
3. 如果是 `geojson`
   - 标准化成 `FeatureCollection`
4. 构造 `BMapSourceRecord`
5. 写入 `runtime.sourceRegistry`
6. 初始化 `runtime.sourceToLayerIds.set(source.id, new Set())`
7. 返回逻辑句柄

这里没有直接百度 API 调用。

### 8.3 `updateSource(runtime, source, sourceHandle)`

调用顺序：

1. 重新读取 `source.toSourceDefinition()`
2. 更新 source record 的 `definition` 和 `normalizedData`
3. 读取 `runtime.sourceToLayerIds.get(source.id)`
4. 逐个取出依赖 layer record
5. 按 layer strategy 分发：
   - `geojson-layer`
     - `native.setData(normalizedData)`
   - `normal-layer`
     - `native.setData(normalizedData)`
   - `overlay-group`
     - 先 `map.removeOverlay(...)` 移除旧 overlay
     - 再按新数据重建 overlay
     - 再 `map.addOverlay(...)` 逐个挂回

关键实现点：

- `updateSource()` 只负责驱动依赖 layer 刷新，不直接操作 control / overlay registry。
- 如果 layer 使用的是 `GeoJSONLayer`，数据更新可以直接 `setData(...)`，样式变化不在这里处理。

### 8.4 `unmountSource(runtime, source, sourceHandle)`

调用顺序：

1. 读取 `runtime.sourceToLayerIds.get(source.id)`
2. 如果仍有依赖 layer，直接抛错
   - 正常情况下这个错误会在 `AbstractMap.removeSource()` 的 cascade 规则前面就被挡住
3. 删除 `runtime.sourceRegistry` 记录
4. 删除 `runtime.sourceToLayerIds` 记录

## 9. DataLayer 的具体实现逻辑

这是 BMapGL 落地里最关键的一层。

### 9.1 总体策略

DataLayer 不做“一种翻译打天下”，而是分三条实现路径：

1. 主路径：`GeoJSONLayer`
   - 适合 `geojson` source 的快速稳定接入
   - 原生支持 `setData / setVisible / setLevel / destroy / click / mousemove / mouseout`

2. 优化路径：`NormalLayer` 子类
   - `PointIconLayer`
   - `LineLayer`
   - `FillLayer`
   - 适合高性能点线面渲染、图层级别控制、picked item 场景

3. 兜底路径：overlay group
   - 当统一 layer kind 无法稳定翻译到百度 layer 时，退化成一组 overlay

### 9.2 第一阶段推荐主实现：优先 `GeoJSONLayer`

原因：

- 它直接接受 GeoJSON 数据
- 生命周期完整
- 可以通过 `map.addGeoJSONLayer/removeGeoJSONLayer` 管理
- 对当前骨架最容易落地

推荐映射：

- `line`
  - `GeoJSONLayer` + `polylineStyle`
- `fill`
  - `GeoJSONLayer` + `polygonStyle`
- `symbol` / `circle`
  - `GeoJSONLayer` + `markerStyle`

这里要接受一个现实：

- 它不是 MapLibre style layer 的等价物
- `paint/layout/filter` 只能收窄成百度能表达的样式与过滤能力

### 9.3 第二阶段优化：支持 `NormalLayer` 子类

当需要更稳定的 picked-item、批量绘制性能或更细粒度状态控制时，再引入：

- `FeatureLayer`
- `PointIconLayer`
- `LineLayer`
- `FillLayer`

推荐做法：

- 在 `translators/layer.ts` 内按 `kind + source.kind + adapter option` 选择翻译路径
- 先写统一的 `resolveLayerStrategy()`，再做具体构造

### 9.4 Layer Record 设计

```ts
interface BMapLayerRecord {
  id: string;
  domain: "data" | "system";
  strategy: "geojson-layer" | "normal-layer" | "overlay-group" | "system-toggle";
  sourceId?: string;
  nativeHandle: unknown;
  sync(next: LayerDefinition, source?: BMapSourceRecord): void;
  dispose(): void;
}
```

### 9.5 `mountLayer(runtime, layer)`

#### 9.5.1 system layer

调用顺序：

1. `const definition = layer.toLayerDefinition()`
2. 根据 `definition.systemKind` 进入分支：
   - `traffic`
     - 可见时 `map.setTrafficOn()`
     - 不可见时 `map.setTrafficOff()`
   - `buildings / indoor / roadnet / labels / poi`
     - 读取当前 display config
     - 调用一次 `map.setDisplayOptions({ ...nextOptions })`
   - `satellite / basemap`
     - 调用 `map.setMapType(...)`
3. 生成 `system-toggle` record
4. 写入 `runtime.layerRegistry`

#### 9.5.2 data layer，策略为 `GeoJSONLayer`

调用顺序：

1. 读取 `layer.toLayerDefinition()`
2. 查找 source record
3. 从 source record 取出 `normalizedData`
4. 组装 `new BMapGL.GeoJSONLayer(layer.id, options)`
   - `dataSource`
   - `reference`
   - `markerStyle / polylineStyle / polygonStyle`
   - `minZoom / maxZoom`
   - `visible`
   - `level`
5. 挂载
   - `map.addGeoJSONLayer(nativeLayer)`
6. 绑定 layer 事件
   - `nativeLayer.addEventListener("click", ...)`
   - `nativeLayer.addEventListener("mousemove", ...)`
   - `nativeLayer.addEventListener("mouseout", ...)`
7. 写入 `runtime.layerRegistry`
8. 在 `runtime.sourceToLayerIds.get(sourceId)` 里登记依赖

#### 9.5.3 data layer，策略为 `NormalLayer`

调用顺序：

1. 读取 source record 的 `normalizedData`
2. 按 `kind` 选择构造函数
   - 点类：`new BMapGL.PointIconLayer(options)`
   - 线类：`new BMapGL.LineLayer(options)`
   - 面类：`new BMapGL.FillLayer(options)`
3. 初始化数据
   - `nativeLayer.setData(normalizedData)`
4. 设置基础状态
   - `nativeLayer.setVisible(visible)`
   - `nativeLayer.setZIndex(zIndex)`
5. 挂载
   - `map.addNormalLayer(nativeLayer)`
6. 绑定 `onclick / onmousemove / onmouseout`
7. 写入 registry 和 source 依赖图

#### 9.5.4 data layer，策略为 `overlay-group`

调用顺序：

1. 把 source data 翻译成 overlay definitions
2. 逐个创建 `Marker / Polyline / Polygon`
3. 对每个 overlay 执行
   - `map.addOverlay(nativeOverlay)`
4. 把 overlay 数组写进 layer record

### 9.6 `updateLayer(runtime, layer, layerHandle)`

#### 9.6.1 `GeoJSONLayer`

因为 `GeoJSONLayer` 文档只公开了：

- `setData`
- `setLevel`
- `setVisible`
- `clearData`
- `destroy`

所以更新策略要明确拆开：

1. 数据变了
   - `native.setData(normalizedData)`
2. 可见性变了
   - `native.setVisible(visible)`
3. zIndex 变了
   - `native.setLevel(toGeoJSONLevel(zIndex))`
4. 样式、filter、reference、事件桥接策略变了
   - `map.removeGeoJSONLayer(native)`
   - `native.destroy()`
   - 重新执行 `mountLayer(...)`

不要假定 `GeoJSONLayer` 支持通用 `setStyle()`；首版直接按“样式变化即重建”处理。

#### 9.6.2 `NormalLayer`

推荐更新逻辑：

1. 数据变了
   - `native.setData(normalizedData)`
2. 可见性变了
   - `native.setVisible(visible)`
3. zIndex 变了
   - `native.setZIndex(zIndex)`
4. 样式变了
   - 直接 `map.removeNormalLayer(native)` 后重建

#### 9.6.3 `overlay-group`

直接全量重建：

1. `map.removeOverlay(...)` 移除旧数组
2. 按新 definition 重建 overlay
3. `map.addOverlay(...)` 逐个添加

### 9.7 `unmountLayer(runtime, layer, layerHandle)`

按 strategy 拆：

- `geojson-layer`
  1. `map.removeGeoJSONLayer(native)`
  2. `native.destroy()`
- `normal-layer`
  1. `map.removeNormalLayer(native)`
  2. 如果有 `destroy()` 则调用，没有就只解绑事件
- `overlay-group`
  1. 对每个 overlay 调 `map.removeOverlay(overlay)`
- `system-toggle`
  1. 按当前 systemKind 做一次关闭操作
     - 例如 `traffic` 调 `setTrafficOff()`

最后统一：

1. 从 `sourceToLayerIds` 里移除 layer id
2. 删除 `runtime.layerRegistry`

## 10. SystemLayer 的具体 API 映射

SystemLayer 可以比 DataLayer 更直接，因为它对应的是平台开关。

推荐映射表：

| `SystemLayerKind` | BMapGL 实现 |
| --- | --- |
| `traffic` | `setTrafficOn()` / `setTrafficOff()` |
| `satellite` | `setMapType(BMAP_SATELLITE_MAP)` |
| `basemap` | `setMapType(BMAP_NORMAL_MAP)` |
| `roadnet` | 通过 `setDisplayOptions({ street: boolean })` 控制，语义上按百度“道路显示”收窄 |
| `labels` / `poi` | 通过 `setDisplayOptions({ poi / poiText / poiIcon })` 收窄 |
| `buildings` | `setDisplayOptions({ building: boolean })` |
| `indoor` | `setDisplayOptions({ indoor: boolean })` |

这里要明确：

- `transit / bicycling / terrain` 在百度 WebGL 下没有与你当前统一语义严格对等的稳定入口
- 这些能力应继续按 capability 裁剪，不要强行承诺

## 11. Overlay 的具体实现逻辑

Overlay 是最容易做实的一层，建议作为第一批落地模块。

推荐映射：

| `OverlayKind` | BMapGL 对应物 |
| --- | --- |
| `marker` | `BMapGL.Marker` |
| `popup` | `BMapGL.InfoWindow` |
| `polyline` | `BMapGL.Polyline` |
| `polygon` | `BMapGL.Polygon` |
| `custom` | `BMapGL.CustomOverlay` 或继承 `Overlay` 自行桥接 |

### 11.1 `mountOverlay(runtime, overlay)`

#### 11.1.1 marker

调用顺序：

1. `const definition = overlay.toOverlayDefinition()`
2. `const point = new BMapGL.Point(lng, lat)`
3. 如果有 icon
   - `const icon = new BMapGL.Icon(url, size, opts)`
4. 创建
   - `const marker = new BMapGL.Marker(point, markerOptions)`
5. 如果有 icon
   - `marker.setIcon(icon)`
6. 如果有 label
   - `marker.setLabel(new BMapGL.Label(text, labelOptions))`
7. 如果有 rotation
   - `marker.setRotation(rotation)`
8. 如果有 zIndex
   - `marker.setZIndex(zIndex)`
9. 挂载
   - `map.addOverlay(marker)`
10. 如果 `visible === false`
    - `marker.hide()`
11. 绑定事件
    - `marker.addEventListener("click", ...)`
    - `marker.addEventListener("mouseover", ...)`
    - `marker.addEventListener("mouseout", ...)`

#### 11.1.2 popup

这里把 popup 作为 `InfoWindow` 特例处理。

调用顺序：

1. 创建内容
   - `const content = resolvePopupContent(definition)`
2. 创建
   - `const infoWindow = new BMapGL.InfoWindow(content, infoWindowOptions)`
3. 如果定义里要求立即打开
   - `map.openInfoWindow(infoWindow, point)`
4. 写入 `overlayRegistry`

这里有两个实现约束：

- `InfoWindow` 不是普通 `map.addOverlay(...)` 对象，所以不能与 marker/polyline/polygon 共用同一挂载路径。
- `openInfoWindow / closeInfoWindow` 在本地类型定义中存在，但当前官方类参考页的检索片段没有直接列出；因此实现时应以当前 BMapGL 实测为准，并把 popup record 独立出来。

#### 11.1.3 polyline

调用顺序：

1. 把坐标数组转成 `Point[]`
2. 创建
   - `const polyline = new BMapGL.Polyline(points, polylineOptions)`
3. 挂载
   - `map.addOverlay(polyline)`
4. 如果 `visible === false`
   - `polyline.hide()`
5. 绑定事件

#### 11.1.4 polygon

调用顺序：

1. 把坐标数组转成 `Point[]`
2. 创建
   - `const polygon = new BMapGL.Polygon(points, polygonOptions)`
3. 挂载
   - `map.addOverlay(polygon)`
4. 如果 `visible === false`
   - `polygon.hide()`
5. 绑定事件

### 11.2 `custom` 的处理

不要把 `CustomOverlay` 逻辑直接堆在 adapter 里。

建议独立桥接类：

- `bridges/custom-overlay.ts`

职责：

- 生成 `initialize(map)` 和 `draw()` 的实现
- 管理 DOM 节点
- 根据 `map.pointToOverlayPixel()` 或 `pointToPixel()` 定位

### 11.3 `updateOverlay(runtime, overlay, overlayHandle)`

#### 11.3.1 marker

调用顺序：

1. 坐标变了
   - `marker.setPosition(point)`
2. icon 变了
   - `marker.setIcon(icon)`
3. label 变了
   - `marker.setLabel(label)`
4. rotation 变了
   - `marker.setRotation(rotation)`
5. zIndex 变了
   - `marker.setZIndex(zIndex)`
6. visible 变了
   - `marker.show()` / `marker.hide()`

#### 11.3.2 popup

调用顺序：

1. 内容或标题变了
   - 直接重建 `InfoWindow`
2. 坐标变了且 popup 应处于打开状态
   - `map.closeInfoWindow()`
   - `map.openInfoWindow(nextInfoWindow, point)`
3. visible 变了
   - `map.openInfoWindow(...)` 或 `map.closeInfoWindow()`

#### 11.3.3 polyline

调用顺序：

1. 路径变了
   - `polyline.setPath(points)`
2. 线色变了
   - `polyline.setStrokeColor(color)`
3. 线宽变了
   - `polyline.setStrokeWeight(weight)`
4. 透明度变了
   - `polyline.setStrokeOpacity(opacity)`
5. 线型变了
   - `polyline.setStrokeStyle(style)`
6. visible 变了
   - `polyline.show()` / `polyline.hide()`

#### 11.3.4 polygon

调用顺序：

1. 路径变了
   - `polygon.setPath(points)`
2. 描边色变了
   - `polygon.setStrokeColor(color)`
3. 描边宽度变了
   - `polygon.setStrokeWeight(weight)`
4. 描边透明度变了
   - `polygon.setStrokeOpacity(opacity)`
5. 填充色变了
   - `polygon.setFillColor(color)`
6. 填充透明度变了
   - `polygon.setFillOpacity(opacity)`
7. visible 变了
   - `polygon.show()` / `polygon.hide()`

### 11.4 `unmountOverlay(runtime, overlay, overlayHandle)`

按类型拆：

- `marker / polyline / polygon / custom`
  - `map.removeOverlay(nativeOverlay)`
- `popup`
  - 如果当前打开的是这个 popup，先 `map.closeInfoWindow()`

然后删除 `runtime.overlayRegistry`

## 12. Control 的具体实现逻辑

推荐映射：

| `ControlKind` | BMapGL 对应物 |
| --- | --- |
| `navigation` | `NavigationControl3D` |
| `scale` | `ScaleControl` |
| `custom` | 继承 `BMapGL.Control` 的桥接类 |

### 12.1 槽位映射

统一 `ControlSlot` 到百度 `ControlAnchor`：

- `top-left` -> `BMAP_ANCHOR_TOP_LEFT`
- `top-right` -> `BMAP_ANCHOR_TOP_RIGHT`
- `bottom-left` -> `BMAP_ANCHOR_BOTTOM_LEFT`
- `bottom-right` -> `BMAP_ANCHOR_BOTTOM_RIGHT`

### 12.2 `mountControl(runtime, control)`

#### 12.2.1 navigation

调用顺序：

1. `new BMapGL.NavigationControl3D({ anchor, offset })`
2. `map.addControl(control)`
3. 如果 `visible === false`
   - `control.hide()`

#### 12.2.2 scale

调用顺序：

1. `new BMapGL.ScaleControl({ anchor, offset })`
2. 如果有 unit，调用
   - `control.setUnit(unit)`
3. `map.addControl(control)`
4. 根据 visible 执行 `show / hide`

#### 12.2.3 custom

调用顺序：

1. 创建桥接类，继承 `BMapGL.Control`
2. 设置
   - `defaultAnchor`
   - `defaultOffset`
3. 实现
   - `initialize(map)`：创建 DOM，追加到 `map.getContainer()`，返回 DOM
4. `map.addControl(control)`
5. 根据 visible 执行 `show / hide`

### 12.3 `updateControl(runtime, control, controlHandle)`

百度控件的“改位置”没有统一的热更新路径，推荐直接重挂：

1. `map.removeControl(nativeControl)`
2. 按新 definition 重新创建控件实例
3. `map.addControl(nextControl)`

仅 `visible` 变化时可以直接：

- `control.show()`
- `control.hide()`

### 12.4 `unmountControl(runtime, control, controlHandle)`

调用顺序：

1. `map.removeControl(nativeControl)`
2. 删除 `runtime.controlRegistry`

### 12.5 自定义控件桥接

建议单独文件：

- `bridges/custom-control.ts`

职责：

- 生成 `initialize(map)` 的 DOM
- 把统一 `position / visible / metadata` 转成百度控件实例行为

## 13. 事件桥接方案

### 13.1 Map 级事件

BMapGL map 级事件要分三类桥：

- 百度原生 map 事件
  - `click`
  - `dblclick`
  - `rightclick`
  - `mousemove`
  - `mouseover`
  - `mouseout`
- 容器 DOM 事件
  - `touchstart / touchmove / touchend / touchcancel`
  - `keydown / keyup`
- 视角状态事件
  - `movestart / moving / moveend / zoomstart / zoomend`

统一映射规则：

- `rightclick -> contextmenu`
- `mouseover -> mouseenter`
- `mouseout -> mouseleave`
- `touch*` 和 `keydown/keyup` 不依赖百度回调，统一走 `map.getContainer()` DOM 桥接
- map 级 `viewChanged` 由 adapter 在真实视角变化后回灌，而不是只依赖业务层调用 `setView()`

### 13.2 Layer 级事件

如果 layer 使用 `GeoJSONLayer` 或 `NormalLayer`，可以桥接：

- `click`
- `dblclick`
- `contextmenu`
- `mousedown`
- `mouseup`
- `mousemove`
- `mouseenter / mouseleave`
- `touchstart / touchend / touchcancel`

但这部分必须注意：

- 并不是所有 layer strategy 都支持 layer 级事件
- overlay-group strategy 下只能退化成 overlay 事件
- `touchmove` 不建议进 `LayerEventMap`
  - MapLibre 官方 layer touch 事件面也只有 `touchstart / touchend / touchcancel`

### 13.3 Overlay 级事件

overlay 是统一输入事件的主承载对象，推荐标准桥接：

- mouse
  - `click / dblclick / contextmenu / mousedown / mouseup / mousemove / mouseenter / mouseleave`
- touch
  - `touchstart / touchmove / touchend / touchcancel`
- drag
  - `dragstart / drag / dragend`

具体映射：

- `Marker / Polyline / Polygon`
  - 优先桥原生 overlay listener
- `CustomOverlay`
  - 直接桥 DOM
- `InfoWindow`
  - 通过内容 DOM 桥 mouse/touch
- 对于触摸和拖拽，不要承诺所有 overlay kind 都是 native
  - marker 可以更接近原生
  - 其他 overlay 允许 adapter 标成 `emulated`

### 13.4 当前 core 已具备的支撑项

这部分已经落在 core 里，BMapGL 实现时应直接复用：

- `src/unified-map/core/events.ts`
  - 已新增 `Map / Layer / Overlay` 的 `mouse / touch / keyboard / drag` 事件契约
- `src/unified-map/core/adapter.ts`
  - `createMap(...)` 现在会拿到 `MapEventBridge`
- `src/unified-map/core/entity.ts`
  - 已提供 adapter 内部事件派发入口
- `src/unified-map/core/internal-events.ts`
  - 提供 map/layer/overlay 统一事件桥工具

因此 BMapGL 大部分输入桥接都可以直接落在 `bmapgl/bridges/input-events.ts`，不需要再回头补 core 事件槽位。

唯一还没完全收口的是 `viewChanged` 的发射时机，见第 2.2 节。

## 14. 样式、聚合与能力裁剪

### 14.1 样式切换

这里有一个 core 前提：当前 `UnifiedMapOptions.style` 只有初始值，没有统一的运行时 `setStyle()` / `patchMapOptions()`。因此在不补 core 之前，下面这套映射只能作为 BMapGL adapter 的私有扩展；如果要把 `style.swap` 算作统一 API 已支持，必须先补 map 级更新入口。

统一 `style.swap` 在百度侧只承诺以下三种输入：

- `styleId`
- `styleJson`
- 内部预设名

落地方法：

- `map.setMapStyleV2({ styleId })`
- `map.setMapStyleV2({ styleJson, version })`

不要尝试兼容完整 MapLibre style spec。

### 14.2 聚合

统一 `cluster.geojson` 继续标记为 `emulated`。

推荐两段式实现：

1. 第一阶段
   - 对点数据做 adapter 侧预聚合
   - 输出 marker batch 或 point-like layer

2. 第二阶段
   - 对接百度的 `Cluster` 能力

业务承诺应保持克制：

- 只承诺“有聚合效果”
- 不承诺跨引擎聚合行为完全一致

### 14.3 `query.features`

继续保持 `none`。

即使百度 layer 能做 picked item，它也不等于统一的 rendered feature query。

## 15. 建议的文件级改动清单

### 15.1 新增文件

- `src/unified-map/bmapgl/adapter.ts`
- `src/unified-map/bmapgl/loader.ts`
- `src/unified-map/bmapgl/runtime.ts`
- `src/unified-map/bmapgl/types.ts`
- `src/unified-map/bmapgl/capabilities.ts`
- `src/unified-map/bmapgl/translators/view.ts`
- `src/unified-map/bmapgl/translators/source.ts`
- `src/unified-map/bmapgl/translators/layer.ts`
- `src/unified-map/bmapgl/translators/overlay.ts`
- `src/unified-map/bmapgl/translators/control.ts`
- `src/unified-map/bmapgl/bridges/custom-overlay.ts`
- `src/unified-map/bmapgl/bridges/custom-control.ts`
- `src/unified-map/bmapgl/bridges/input-events.ts`

### 15.2 当前已完成的 core 对齐项

- `src/unified-map/core/adapter.ts`
  - 已增加 `load()` 作为统一异步准备入口
  - 已让 `createMap(...)` 接受 `MapEventBridge`
- `src/unified-map/core/entity.ts`
  - 已增加 adapter 内部事件派发入口
- `src/unified-map/core/internal-events.ts`
  - 已提供 map/layer/overlay 事件桥工具
- `src/unified-map/core/map.ts`
  - 已增加 `load()` / `isLoaded`
  - 已要求 `mount()` 前必须先完成 `load()`
  - 已让 `bindSource()` 同时监听 `dataChanged`
  - 已让 `mount()` 向 adapter 传递 `MapEventBridge`
- `src/unified-map/core/events.ts`
  - 已追加 `mouse / touch / keyboard / drag` 事件契约

### 15.3 仍建议补的 core 修改

- `src/unified-map/core/map.ts`
  - 统一 `initialView` 的责任归属，避免 `createMap()` 与 `mount()` 双重设置视角
  - 去掉 `setView()` 里的乐观 `viewChanged`，改由 adapter bridge 回灌真实视角变化
  - 增加 map 级可变配置更新入口，例如 `setStyle()` 或 `patchMapOptions()`
- `src/unified-map/core/adapter.ts`
  - 如果补 map 级更新入口，需要增加对应 hook，例如 `setStyle(...)` 或 `updateMapOptions(...)`
- `src/unified-map/core/types.ts`
  - 把“创建期 map options”和“运行期可变 map options”拆开，避免 `UnifiedMapOptions` 同时承担两种职责
- `src/unified-map/core/internal-events.ts`
  - 后续可把 `MapEventBridge` 收窄为“视角 + 交互”事件桥，避免 adapter 误发 map 生命周期事件

## 16. 分阶段交付顺序

### Phase 0: core 契约收口

- 统一 `initialView` 的责任归属
- 收口 `viewChanged` 的语义与发射时机
- 增加 map 级 `style / interactive` 更新入口

交付结果：

- BMapGL adapter 的 map / view / style contract 先稳定下来，避免边实现边返工

### Phase 1: 可用最小闭环

- loader
- `AbstractMapAdapter.load()` / `AbstractMap.load()`
- `BMapGLAdapter.createMap / destroyMap / setView / getView / project / unproject`
- marker / polyline / polygon / custom overlay
- navigation / scale / custom control

交付结果：

- 地图可真实挂载
- 基础视角和 overlay/control 全可用

### Phase 2: Source + DataLayer

- source registry
- `GeoJSONLayer` 路线
- layer 依赖图
- source 更新驱动 layer 重渲染

交付结果：

- `geojson + line/fill/symbol` 可跑通

### Phase 3: SystemLayer + style + cluster

- traffic / satellite / basemap / roadnet / poi / buildings / indoor
- `setMapStyleV2`
- cluster 预聚合

### Phase 4: 事件与优化

- map/layer/overlay input bridge
- `NormalLayer` 优化路径
- 更细粒度增量更新

## 17. 验收标准

达到以下条件，才算 BMapGL 适配器完成：

1. `new DemoMap(..., new BMapGLAdapter())` 可以真实挂载并销毁，不泄漏 WebGL context。
2. `await map.load(); map.mount();` 这条调用链稳定且可重入。
3. 初始视角只初始化一次；`viewChanged` 只表示真实视角变化，不出现 API 乐观回调和 native 回调双发。
4. `setView()` 在无动画和有动画场景都正确工作。
5. `Source -> Layer` 更新链路闭环，改 source 后可驱动 layer 刷新。
6. `style.swap` 能通过统一 API 驱动 `setMapStyleV2`，而不是 adapter 私有方法。
7. overlay / control 的增删改查和地图生命周期一致。
8. system layer 可按 capability 做显式裁剪，而不是 silently ignore。
9. 所有“不等价能力”都在 capability 和文档里标成 `emulated` 或 `none`。

## 18. 最终建议

如果现在就开始做，我建议按下面顺序推进：

1. 先收口 core 的 `initialView / viewChanged / style.swap` 契约。
2. 新建 `src/unified-map/bmapgl/` 模块。
3. 先交付 `loader + map + overlay + control`。
4. DataLayer 第一版直接走 `GeoJSONLayer`。
5. 等功能闭环后，再做 `NormalLayer` 优化和更细粒度的 input 事件支持分层。

原因很简单：

- overlay / control 与百度原生模型最接近，最容易先做实。
- `GeoJSONLayer` 比从第一天就硬啃 `FeatureLayer / PointIconLayer / LineLayer / FillLayer` 更稳。
- `load()`、source 刷新、基础事件槽位这些 core 问题已经基本补齐；现在真正需要先收口的是 map 级契约。
- 只有把 `initialView / viewChanged / style.swap` 三件事先定死，后面的 BMapGL adapter 才不会在 Phase 1 写完后又回头改 mount 和事件语义。
