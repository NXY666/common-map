# 统一坐标抽象与距离计算融合方案

## 1. 背景

当前仓库的统一坐标入口仍然是 `LngLatLike` / `LngLatLiteral`：

- 只有 `lng / lat`
- 没有坐标系语义
- 没有 `alt`
- `project / unproject / setView / getView` 都默认“输入输出坐标天然同构”

这在单一引擎下问题不大，但一旦接入不同底图就会失真：

- MapLibre 更接近 `WGS84`
- 高德更接近 `GCJ02`
- 百度更接近 `BD09`

你给的 `E:\SecretProjects\bmap-tracker-vue\src\utils\coordinate.ts` 已经把这个最关键的缺口补上了。它提供了三件当前仓库真正缺的能力：

- `Coordinate` 值对象，统一持有 `wgs84 / gcj02 / bd09`
- 懒转换 getter，避免各 adapter 和业务对象各自重复写坐标互转
- 距离、三维距离、插值能力，为后续轨迹和路径对象提供统一空间计算入口

结论很直接：

> 这套实现不应该塞进 `overlay / control`，而应该作为独立的 `geo/` 基础模块落到 `unified-map` 下，由 `core` 和各 adapter 共享。

## 2. 融合目标

这次融合只解决 4 个问题，不额外扩题：

1. 给统一层补上显式坐标系模型。
2. 让 adapter 能声明“自己原生使用哪种坐标系”。
3. 让 `Map` 级 API 在 `Coordinate` 与原生坐标系之间自动转换。
4. 在此基础上补 `distance` / `distance3d`，后续再顺手接 `interpolate` / `interpolate3d`。

## 3. 最终落点

建议新增目录：

```text
src/unified-map/
  geo/
    transformer.ts
    coordinate.ts
    index.ts
```

职责边界定死：

- `geo/transformer.ts`
  - 以外部 `transformer.ts` 为算法基线实现
  - 负责 `wgs84 <-> gcj02 <-> bd09` 基础互转
- `geo/coordinate.ts`
  - 以外部 `coordinate.ts` 为算法基线实现
  - 负责 `Coordinate` 值对象、距离、三维距离、插值
- `core/`
  - 只消费 `geo/` 暴露出来的类型和转换函数
  - 不自己再写第二套坐标转换逻辑
- `adapter`
  - 只声明原生坐标系，并在边界做坐标归一
  - 不再各自实现私有 `bd09ToWgs84`、`gcj02ToBd09` 之类 helper

这层一定要独立出来。否则后面无论 `standard/overlay` 还是真实 `BMapGLAdapter`，都会继续把坐标转换逻辑散落到对象类和适配器里。

## 4. 推荐类型设计

### 4.1 直接复用并公开的类型

建议从外部实现里正式导出这些类型：

```ts
export type CoordinateType = "wgs84" | "gcj02" | "bd09";

export interface LngLatAltLiteral<T extends number | string = number | string> {
  lng: T;
  lat: T;
  alt?: T;
}

export interface CoordinateGroup<T extends number | string = number | string> {
  wgs84?: LngLatAltLiteral<T>;
  gcj02?: LngLatAltLiteral<T>;
  bd09?: LngLatAltLiteral<T>;
}
```

这里先把解析边界写死：

- `LngLatAltLiteral<number | string>` 只用于 `geo/` 层 ingest 多来源坐标
- `core` 公共 `LngLatLike / LngLatLiteral` 只接受 `number`
- 字符串转数字只允许发生在 `Coordinate` 构造或 `Coordinate.from(...)`
- `Map`、adapter、事件桥都不负责再解析字符串

### 4.2 对外协议

`core` 的对外协议只允许 `WGS84`。

也就是说：

- 用户传给 `Map / Overlay / Layer / Control` 的坐标一律按 `WGS84` 解释
- 用户从 `core` 收到的坐标也一律按 `WGS84` 返回
- `GCJ02 / BD09` 不进入 `core` 的公共 API 面

公开类型建议保留 `LngLat*` 这一套名字，但升级为带 `alt` 的 `WGS84` 语义：

```ts
export type LngLatTuple = readonly [lng: number, lat: number, alt?: number];

export interface LngLatLiteral {
  lng: number;
  lat: number;
  alt?: number;
}

export type LngLatLike = LngLatTuple | LngLatLiteral;
```

这里的 `LngLatLike` 不再是“任意经纬度”，而是：

- `WGS84`
- 可带 `alt`

这就是新的硬语义。

### 4.3 内部标准模型

`Coordinate` 不作为 `core` 的主要对外输入类型，而是内部标准模型：

- `core` 内部可统一转成 `Coordinate`
- `core/internal` 用 `Coordinate` 负责 `WGS84 <-> native` 转换
- `geo/` 工具函数使用 `Coordinate`

如果后面要把内部全部统一到 `Coordinate`，会更规范，也更省事；但这件事发生在内部，不暴露给业务层。

这里的边界定死：

- `Map / Overlay / Layer / Control` 对外只收 `WGS84 LngLatLike`
- `CoordinateGroup` 和多坐标系输入只在 `geo/core-internal` 使用，不进入 adapter 对 core 的正式契约
- `Coordinate / CoordinateGroup / LngLatAltLiteral` 不通过 `core/types.ts` 重新导出，避免把多坐标系输入误当成公共协议
- adapter 对 core 的正式契约只接收 `Native*` 类型，不直接处理用户传入的公共坐标

### 4.4 `Coordinate` 的导出能力

虽然 `Coordinate` 主要用于内部转换，但它必须能导出成结构化经纬度对象，方便：

- adapter 喂给原生 SDK
- `core` 把内部坐标转回公共 `WGS84`
- 调试和日志输出

建议至少提供这些能力：

```ts
class Coordinate {
  get wgs84(): LngLatAltLiteral<number>;
  get gcj02(): LngLatAltLiteral<number>;
  get bd09(): LngLatAltLiteral<number>;

  toLiteral(type: CoordinateType): LngLatAltLiteral<number>;
  toTuple(type: CoordinateType): readonly [number, number, number?];
}
```

注意：

- 导出的结构里也保留 `alt`
- 即使目标地图引擎不支持 `alt`，`Coordinate` 也不能在导出阶段主动丢掉它

### 4.5 Adapter 原生坐标系

建议在 `AbstractMapAdapter` 新增：

```ts
public abstract readonly nativeCoordinateType: CoordinateType;
```

当前已知推荐值：

- `PseudoMapLibreAdapter.nativeCoordinateType = "wgs84"`
- `PseudoBMapGLAdapter.nativeCoordinateType = "bd09"`

如果后面接高德，就设成 `gcj02`。

## 5. 运行时改造方案

### 5.1 统一转换原则

所有坐标流都按同一条路径处理：

```text
业务输入（WGS84 LngLatLike）
  -> core/internal-coordinate
  -> 转成 Coordinate
  -> 按 adapter.nativeCoordinateType 取值
  -> adapter(native)
  -> 调用原生 SDK

原生事件 / 原生返回值
  -> adapter(native)
  -> core/internal-coordinate
  -> 解释为 adapter.nativeCoordinateType
  -> 转成 Coordinate
  -> 转回 WGS84 LngLatLiteral
  -> 回到统一 API
```

这意味着：

- 业务层永远面对 `WGS84`
- adapter 永远面对自己的原生坐标系
- 中间只有一套 `Coordinate` 转换逻辑，而且这套逻辑归 `core/internal` 所有
- `public` 与 `native` 虽然结构可能相同，但在类型名和接口名上必须分开，不能共用同一个 `LngLatLike`
- adapter 不做第二层公共参数解析或坐标系兼容，只信任 core 传下来的 `Native*`
- core 不对 adapter 返回值做纠错、补值或回填；adapter 返回什么，core 就只做坐标系转换后原样上抛

### 5.2 首批需要接入的 core 位置

### `src/unified-map/core/types.ts`

这里直接改语义，不再保留“无坐标系、无海拔”的旧模型：

- `LngLatTuple / LngLatLiteral / LngLatLike` 全部升级为带 `alt` 的 `WGS84` 类型
- `CameraState.center` 继续是 `LngLatLike`，但语义改成 `WGS84 + optional alt`
- `BoundsLiteral.southwest / northeast` 继续是 `LngLatLiteral`，但也要带 `alt`
- `Coordinate / CoordinateGroup / LngLatAltLiteral` 继续留在 `geo/` 命名空间，不通过 `core/types.ts` 再导出

### `src/unified-map/core/adapter.ts`

新增：

- `nativeCoordinateType`

同时补一组 adapter 专用 native 类型，和公共 `WGS84` 类型强制隔离：

```ts
export type NativeLngLatTuple = readonly [lng: number, lat: number, alt?: number];

export interface NativeLngLatLiteral {
  lng: number;
  lat: number;
  alt?: number;
}

export type NativeLngLatLike = NativeLngLatTuple | NativeLngLatLiteral;

export interface NativeBoundsLiteral {
  southwest: NativeLngLatLiteral;
  northeast: NativeLngLatLiteral;
}

export interface NativeCameraState {
  center: NativeLngLatLike;
  zoom: number;
  bearing?: number;
  pitch?: number;
  bounds?: NativeBoundsLiteral;
  padding?: MapPadding;
}

export interface AdapterMapCreateOptions
  extends Omit<UnifiedMapOptions, "initialView"> {
  initialView: NativeCameraState;
}
```

adapter 抽象方法直接改成 native 语义：

- `createMap(target, options: AdapterMapCreateOptions, eventBridge)`
- `setView(mapHandle, view: NativeCameraState, transition?)`
- `getView(mapHandle): NativeCameraState`
- `project(mapHandle, lngLat: NativeLngLatLike): ScreenPoint`
- `unproject(mapHandle, point): NativeLngLatLiteral`

这样做的目的是彻底消灭歧义：

- `core/map.ts` 只处理 public WGS84
- `core/adapter.ts` 只处理 native
- 两边中间只用 `Coordinate` 过桥

### `src/unified-map/core/map.ts`

这里也直接改公开签名。建议统一使用 `internal-coordinate.ts` 的 helper（如有需要可在 `Map` 内包一层同名 private 方法）：

- `toCoordinate(value: LngLatLike): Coordinate`
- `toNativeLngLat(value: LngLatLike, nativeType: CoordinateType): NativeLngLatLiteral`
- `fromNativeLngLat(value: NativeLngLatLiteral, nativeType: CoordinateType): LngLatLiteral`

然后优先接入这几个公开 API：

- `setView()`
- `getView()`
- `project()`
- `unproject()`

新的公开语义定死：

- `project(lngLat: LngLatLike): ScreenPoint`
- `unproject(point: ScreenPoint): LngLatLiteral`
- `getView().center` 是 `LngLatLike`
- `setView()` 里的 `center` 和 `bounds` 只接受 `WGS84`

原因很直接：

- 这是所有引擎共用的地图级空间边界
- 改这里收益最大
- 这里改完，后面 `overlay / layer / event` 才能统一跟进

### 5.3 Overlay / Layer / Event 的接入策略

这块也按同一原则处理：

- 对外字段继续叫 `coordinate / coordinates / lngLat`
- 对外类型统一是 `WGS84 LngLatLike / LngLatLiteral`
- 内部存储建议统一转成 `Coordinate`

必须同步改掉的点：

- `Overlay` 相关 `coordinate / coordinates` 都允许 `alt`
- `Layer` 命中事件里的 `lngLat` 要允许 `alt`
- `Map / Layer / Overlay / TouchPoint` 事件里的 `lngLat` 统一按 `WGS84` 返回
- 所有 demo / pseudo adapter 同步补上 `alt` 处理

这里不再改字段名，因为真正的问题不是命名，而是坐标系和海拔信息。

补一条实施口径，避免“语义改了但文件没改”的误解：

- `core/overlay.ts`、`core/layer.ts`、`core/events.ts` 首轮可能不需要功能性代码改动
- 但它们承载的公开语义已经随着 `types.ts` 升级为 `WGS84 + optional alt`
- 只要某个模块自己新增了坐标转换、比较、序列化逻辑，就必须纳入这次改造范围

### 5.4 事件归一化白名单

事件归一化不能做成“泛型黑箱”。

必须显式列出只处理这些字段：

- `MouseInteractionPayload.lngLat`
- `TouchInteractionPayload.lngLat`
- `TouchPointPayload.lngLat`
- `viewChanged.view.center`
- `viewChanged.view.bounds.southwest`
- `viewChanged.view.bounds.northeast`

实现上也不要用一个宽泛的 `normalizeEventPayloadFromNative<T>()` 吃掉所有事件。

建议拆成：

- `normalizeMapEventPayloadFromNative(type, payload, nativeType)`
- `normalizeLayerEventPayloadFromNative(type, payload, nativeType)`
- `normalizeOverlayEventPayloadFromNative(type, payload, nativeType)`
- `normalizeMouseInteractionPayloadFromNative(payload, nativeType)`
- `normalizeTouchInteractionPayloadFromNative(payload, nativeType)`

### 5.5 `alt` 的保存规则

这条规则必须写死：

- 只要用户给了 `alt`，`core` 就必须存住
- 只要 `Coordinate` 里有 `alt`，转换到 `wgs84 / gcj02 / bd09` 时都要继续带上
- 地图引擎即使不支持 `alt`，adapter 也只能在“写入原生 SDK”那一瞬间忽略，不能回写把 `core` 的 `alt` 清掉

也就是说：

- `core` 的空间模型是三维友好的
- 引擎是否支持三维只是 adapter 落地能力问题，不影响 `core` 存储

但在 `adapter -> core` 的回流方向，再加一条边界规则：

- adapter 返回值是事实源
- 如果 adapter 返回里没有 `alt`，core 就返回没有 `alt`
- core 不允许用旧状态给 adapter 返回值补海拔

### 5.6 避免无意义转换

必须避免“输入本来就是 `WGS84`，却先 `toCoordinate(...).wgs84` 再导出”的空转。

- `nativeCoordinateType === "wgs84"` 时，`toNativeLngLat(...)` 直接返回标准化后的字面量，不构建 `Coordinate`
- `distance()` / `distance3d()` 面向公共 `WGS84` 输入，直接使用 `toLngLatLiteral(...)`，不做 `Coordinate` 包装
- `unproject()` 在 `nativeCoordinateType === "wgs84"` 时直接回公共字面量；只有非 `wgs84` 才走 `Coordinate` 转换
- 只有在发生坐标系切换（`wgs84 <-> gcj02/bd09`）时，才允许构建 `Coordinate`

## 6. 距离与三维距离的接入方案

### 6.1 低层纯函数

外部 `coordinate.ts` 里的这几个函数应该原样保留：

- `haversine`
- `haversine3d`
- `interpolate`
- `interpolate3d`

建议直接放在：

- `src/unified-map/geo/coordinate.ts`

这样后续无论是：

- 轨迹对象
- 覆盖物路径对象
- geolocate 结果
- demo 或手工验证

都能直接复用。

### 6.2 Map 级便利方法

在 `Coordinate` 落进项目后，再给 `AbstractMap` 加一层薄封装：

```ts
public distance(from: LngLatLike, to: LngLatLike): number
public distance3d(from: LngLatLike, to: LngLatLike): number
```

内部规则定死：

- 直接 `toLngLatLiteral(...)` 归一为公共 `WGS84` 字面量
- 调用 `haversine / haversine3d`

这样做的好处是：

- 业务层不用自己关心当前地图底层是 `bd09` 还是 `gcj02`
- `MapLibre` 和 `BMapGL` 得到一致的距离结果
- 3D 距离直接复用 `alt`

### 6.3 单位规则

由于外部实现目前约定：

- 平面距离返回 `kilometers`
- 高度差输入是 `meters`

第一版先保持这个约定，不改语义。

文档必须明确写清：

- `distance()` 返回公里
- `distance3d()` 返回公里
- `alt` 以米为单位

如果后面业务更常用米制，可以再加包装方法，但第一版不要改掉外部实现的语义。

## 7. 实施顺序

建议按下面顺序做，风险最低：

1. 新增 `geo/transformer.ts` 与 `geo/coordinate.ts`
2. 在 `src/unified-map/index.ts` 公开导出 `geo/`
3. 在 `core/types.ts` 把 `LngLat*` 升级为 `WGS84 + alt` 语义
4. 在 `AbstractMapAdapter` 增加 `nativeCoordinateType`
5. 在 `core/map.ts` 接入 `Coordinate` 内部转换
6. 改 `AbstractMap.setView / getView / project / unproject`
7. 同步校准 `overlay / layer / event` 的公开 `WGS84 + alt` 语义，并修改 `pseudo demo / pseudo adapter` 的消费点
8. 最后补 `AbstractMap.distance / distance3d`

这个顺序的好处是：

- 每一步都能独立验证
- 对外协议边界很清楚
- 内外坐标模型职责不会混在一起

## 8. 集成核对项

这次方案不要求为坐标转换额外写自动化测试。

你已经明确给出的前提是：

- 外部 `coordinate.ts / transformer.ts` 的转换算法本身可信

所以这里保留的是“融合后必须人工核对”的集成项，而不是新增测试任务：

### 8.1 类型与边界

- `LngLatLike / LngLatLiteral` 只代表公共 `WGS84 + optional alt`
- adapter 内部只吃自己命名清晰的 native 类型，不复用公共 `LngLatLike`
- `Coordinate / CoordinateGroup / LngLatAltLiteral` 继续只留在 `geo/internal/adapter` 边界

### 8.2 Map 级行为

- `MapLibre(wgs84)` 下 `project / unproject` 没有重复转换
- `BMapGL(bd09)` 下统一 API 传入 `WGS84` 时，会在 `Map -> adapter` 边界转为 `bd09`
- `unproject()` 对外重新回到 `WGS84`

### 8.3 海拔与距离

- 用户给过的 `alt` 在 `core` 内流转后不丢
- `distance()` 和 `distance3d()` 都以 `WGS84` 归一结果计算
- adapter 返回没有 `alt` 时，core 也不会伪造 `alt`

### 8.4 事件

- adapter 原生事件若返回 `bd09`，业务监听到的 `lngLat` 仍应是 `WGS84`
- 若事件来源本身携带高度，`lngLat.alt` 也要保留

## 9. 已知边界

有 3 个边界要先写进方案里，避免后续误判：

### 9.1 外部实现依赖 `@turf/turf`

当前仓库还没有这个依赖。正式融合时需要补：

- `@turf/turf`

第一版可以直接引入，但实现方式写成：

- 以外部实现为算法基线迁入
- 在本仓库内重新命名、收敛边界
- 后续若包体积有压力，再替换为更窄的 turf 子包

### 9.2 外部 `transformer.ts` 当前没有 `outOfChina` 判断

这意味着如果项目后面要处理中国境外点位，`wgs84 <-> gcj02` 互转可能会产生不必要偏移。

如果这个仓库只服务国内地图，这不是当前阻塞项。

如果后面要做全球底图，再在不改公开 API 的前提下补 guard 即可。

### 9.3 这是一次语义断代，不是类型名断代

这意味着：

- `LngLatLike` 不再代表“模糊经纬度”，而是明确的 `WGS84`
- `LngLatLike` 现在带 `alt`
- `GCJ02 / BD09` 不再允许通过 `core` 公共 API 直接传入
- demo、pseudo adapter、文档示例都要跟着改语义

这不是副作用，而是这次方案的前提。

## 10. 最务实的结论

这次融合最合理的方式不是“把 `Coordinate` 塞进某个 overlay 类”，而是：

- 先独立出 `geo/` 基础模块
- 再让 `core` 对外只接收和返回 `WGS84`
- 同时让 `Coordinate` 成为内部统一转换模型
- 最后顺手加 `distance / distance3d`

一句话总结：

> `Coordinate` 是统一地图层的基础空间模型，不是某个具体覆盖物的附属工具；先把它落成 `geo/`，后面的距离计算、路径插值、BMapGL 坐标归一都会自然变简单。

## 11. 项目级改动清单

这一节不是原则描述，而是直接对当前仓库做逐文件盘点。

目标只有一个：

- 把“对外只收发 `WGS84`，内部统一转 `Coordinate`，`alt` 不丢”的方案落到现有代码结构里

### 11.1 受影响文件总览

需要实际改代码的文件：

- `package.json`
- `src/unified-map/core/types.ts`
- `src/unified-map/core/adapter.ts`
- `src/unified-map/core/map.ts`
- `src/unified-map/core/internal-events.ts`
- `src/unified-map/pseudo/pseudo-adapters.ts`
- `src/unified-map/pseudo/demo-models.ts`
- `src/unified-map/index.ts`

需要新增的文件：

- `src/unified-map/geo/transformer.ts`
- `src/unified-map/geo/coordinate.ts`
- `src/unified-map/geo/index.ts`
- `src/unified-map/core/internal-coordinate.ts`

建议同步更新的文档：

- `docs/unified-map-api-guide.md`
- `docs/overlay-control-abstraction-plan.md`
- `docs/bmapgl-implementation-plan.md`

当前这次不需要直接改代码的文件：

- `src/unified-map/core/overlay.ts`
- `src/unified-map/core/control.ts`
- `src/unified-map/core/layer.ts`
- `src/unified-map/core/source.ts`
- `src/unified-map/core/entity.ts`
- `src/main.ts`

理由：

- 这些文件当前不直接持有坐标转换逻辑
- 它们会被 `types.ts` 语义升级连带影响
- 真正要改的是类型定义、Map 边界、adapter 边界和 demo 实现
- 这不代表它们不受影响，只代表首轮不需要功能性补丁

### 11.2 当前代码里的直接阻塞项

在开始坐标融合前，仓库里已经有 3 处编译错误：

- `src/unified-map/pseudo/demo-models.ts`
  - `OverlayDefinition` 当前并没有 `coordinate` 字段，但 `DemoMarkerOverlay.toOverlayDefinition()` 在返回里写了它
- `src/unified-map/pseudo/demo-models.ts`
  - `DemoNavigationControl` 没有实现 `AbstractControl` 要求的抽象成员
- `src/unified-map/pseudo/demo.ts`
  - `DemoMarkerOverlay` 没有 `setCoordinate()`，但 demo 在调用

这 3 处要和坐标改造一起修，不然没法用 `npm run build` 验证这次改造。

### 11.3 逐文件拟改 diff

下面的 diff 是以当前仓库状态为基准写的“实施草案”。

#### 11.3.1 `package.json`

当前动机：

- 外部 `coordinate.ts` 依赖 `@turf/turf`

```diff
diff --git a/package.json b/package.json
@@
   "dependencies": {
+    "@turf/turf": "^7.3.4",
     "maplibre-gl": "^5.21.0"
   },
```

#### 11.3.2 `src/unified-map/geo/transformer.ts`

当前动机：

- 以外部坐标互转实现为基线迁入，并在仓库内维护

```diff
diff --git a/src/unified-map/geo/transformer.ts b/src/unified-map/geo/transformer.ts
new file mode 100644
@@
+// 以外部 transformer 实现为算法基线迁入
+// 保留：
+// - wgs84ToGcj02
+// - gcj02ToWgs84
+// - gcj02ToBd09
+// - bd09ToGcj02
+// - degDiffToMeters
+// - roundTripErrorMetersWgsGcj
```

#### 11.3.3 `src/unified-map/geo/coordinate.ts`

当前动机：

- 以外部 `Coordinate` 值对象与空间计算为基线迁入
- 补齐 `toLiteral()` / `toTuple()`，方便 adapter 和 `core` 内部使用

```diff
diff --git a/src/unified-map/geo/coordinate.ts b/src/unified-map/geo/coordinate.ts
new file mode 100644
@@
+// 以外部 coordinate 实现为算法基线迁入
+// 额外补两组导出：
+export type CoordinateType = "wgs84" | "gcj02" | "bd09";
+
+export interface LngLatAltLiteral<T extends number | string = number | string> {
+  lng: T;
+  lat: T;
+  alt?: T;
+}
+
+export interface CoordinateGroup<T extends number | string = number | string> {
+  wgs84?: LngLatAltLiteral<T>;
+  gcj02?: LngLatAltLiteral<T>;
+  bd09?: LngLatAltLiteral<T>;
+}
+
+// 在 Coordinate 上补：
+// - toLiteral(type: CoordinateType)
+// - toTuple(type: CoordinateType)
+// 导出时必须保留 alt，不能丢。
```

#### 11.3.4 `src/unified-map/geo/index.ts`

```diff
diff --git a/src/unified-map/geo/index.ts b/src/unified-map/geo/index.ts
new file mode 100644
@@
+export * from "./transformer";
+export * from "./coordinate";
```

#### 11.3.5 `src/unified-map/core/types.ts`

当前受影响的核心位置：

- `7-14`
- `44-47`
- `56-63`
- `220-231`

当前动机：

- `LngLatLike / LngLatLiteral` 升级为 `WGS84 + optional alt`
- `toLngLatLiteral()` 必须能保留 `alt`
- 不通过 `core/types.ts` 重新导出多坐标系输入类型，避免污染公共协议

```diff
diff --git a/src/unified-map/core/types.ts b/src/unified-map/core/types.ts
@@
-export type LngLatTuple = readonly [lng: number, lat: number];
+export type LngLatTuple = readonly [lng: number, lat: number, alt?: number];
 
 export interface LngLatLiteral {
   lng: number;
   lat: number;
+  alt?: number;
 }
@@
 export interface BoundsLiteral {
   southwest: LngLatLiteral;
   northeast: LngLatLiteral;
 }
@@
 export function toLngLatLiteral(value: LngLatLike): LngLatLiteral {
@@
-    return { lng: value.lng, lat: value.lat };
+    return value.alt === undefined
+      ? { lng: value.lng, lat: value.lat }
+      : { lng: value.lng, lat: value.lat, alt: value.alt };
   }
 
-  return { lng: value[0], lat: value[1] };
+  return value[2] === undefined
+    ? { lng: value[0], lat: value[1] }
+    : { lng: value[0], lat: value[1], alt: value[2] };
 }
```

#### 11.3.6 `src/unified-map/core/internal-coordinate.ts`

当前动机：

- 不把坐标转换逻辑散落进 `map.ts` 和各 adapter
- 把 “WGS84 公共 API <-> Coordinate <-> native coordinate type” 收敛成单一内部模块

```diff
diff --git a/src/unified-map/core/internal-coordinate.ts b/src/unified-map/core/internal-coordinate.ts
new file mode 100644
@@
+import { Coordinate, type CoordinateType } from "../geo/coordinate";
+import type { CameraState, LngLatLike, LngLatLiteral } from "./types";
+import type { NativeCameraState, NativeLngLatLiteral } from "./adapter";
+import { toLngLatLiteral } from "./types";
+
+export function toCoordinate(value: LngLatLike): Coordinate { ... } // 只按 WGS84 解释
+export function fromNativeLngLat(
+  value: NativeLngLatLiteral,
+  nativeType: CoordinateType,
+): LngLatLiteral { ... } // native=wgs84 时直接返回，不构建 Coordinate
+export function toNativeLngLat(
+  value: LngLatLike,
+  nativeType: CoordinateType,
+): NativeLngLatLiteral { ... } // native=wgs84 时直接标准化为 literal
+export function normalizePublicCameraState(view: CameraState): CameraState { ... }
+export function toNativeCameraState(view: CameraState, nativeType: CoordinateType): NativeCameraState { ... }
+export function toPublicCameraState(view: NativeCameraState, nativeType: CoordinateType): CameraState { ... }
+export function normalizeMouseInteractionPayloadFromNative(...) { ... }
+export function normalizeTouchInteractionPayloadFromNative(...) { ... }
+export function normalizeMapEventPayloadFromNative(...) { ... }
+export function normalizeLayerEventPayloadFromNative(...) { ... }
+export function normalizeOverlayEventPayloadFromNative(...) { ... }
```

#### 11.3.7 `src/unified-map/core/adapter.ts`

当前受影响的核心位置：

- `8-17`
- `26`
- `34-40`
- `48-73`

当前动机：

- adapter 明确声明自己的原生坐标系
- adapter 的 `project / unproject / setView / getView` 只处理 native 坐标
- `AbstractMap` 负责公共 `WGS84` 与 native 之间的转换

```diff
diff --git a/src/unified-map/core/adapter.ts b/src/unified-map/core/adapter.ts
@@
 import type {
   CameraTransition,
+  CoordinateType,
  MapPadding,
   MapMountTarget,
   ScreenPoint,
   UnifiedMapOptions,
   UnifiedMapRuntimeOptions,
 } from "./types";
+
+export type NativeLngLatTuple = readonly [lng: number, lat: number, alt?: number];
+
+export interface NativeLngLatLiteral {
+  lng: number;
+  lat: number;
+  alt?: number;
+}
+
+export type NativeLngLatLike = NativeLngLatLiteral | NativeLngLatTuple;
+
+export interface NativeBoundsLiteral {
+  southwest: NativeLngLatLiteral;
+  northeast: NativeLngLatLiteral;
+}
+
+export interface NativeCameraState {
+  center: NativeLngLatLike;
+  zoom: number;
+  bearing?: number;
+  pitch?: number;
+  bounds?: NativeBoundsLiteral;
+  padding?: MapPadding;
+}
+
+export interface AdapterMapCreateOptions
+  extends Omit<UnifiedMapOptions, "initialView"> {
+  initialView: NativeCameraState;
+}
@@
   public abstract readonly engine: string;
+  public abstract readonly nativeCoordinateType: CoordinateType;
@@
-  // createMap() must fully initialize the native map, including:
+  // createMap() receives AdapterMapCreateOptions.initialView already
+  // converted into adapter.nativeCoordinateType.
@@
   public abstract createMap(
     target: MapMountTarget,
-    options: Readonly<UnifiedMapOptions>,
+    options: Readonly<AdapterMapCreateOptions>,
+    eventBridge: MapEventBridge,
+  ): unknown;
@@
-  // setView() only requests a camera change.
+  // setView() / getView() / project() / unproject() only operate on
+  // adapter-defined native coordinate types. AbstractMap is the sole
+  // owner of public WGS84 <-> native conversion.
+  public abstract setView(
+    mapHandle: unknown,
+    view: NativeCameraState,
+    transition?: CameraTransition,
+  ): void;
+
+  public abstract getView(mapHandle: unknown): NativeCameraState;
+
+  public abstract project(
+    mapHandle: unknown,
+    lngLat: NativeLngLatLike,
+  ): ScreenPoint;
+
+  public abstract unproject(
+    mapHandle: unknown,
+    point: ScreenPoint,
+  ): NativeLngLatLiteral;
```

#### 11.3.8 `src/unified-map/core/map.ts`

当前受影响的核心位置：

- `14-23`
- `56-58`
- `203-259`
- `617-623`

当前动机：

- `Map` 是公共 WGS84 边界
- `Map` 必须在调用 adapter 前转 native
- `Map` 必须在接收 adapter 返回和事件回灌时转回 WGS84
- `Map` 还要补 `distance / distance3d`

```diff
diff --git a/src/unified-map/core/map.ts b/src/unified-map/core/map.ts
@@
 import type {
   CameraState,
   CameraTransition,
   LngLatLike,
   LngLatLiteral,
@@
} from "./types";
+import type { AdapterMapCreateOptions } from "./adapter";
+import { haversine, haversine3d } from "../geo/coordinate";
+import { toLngLatLiteral } from "./types";
+import {
+  normalizePublicCameraState,
+  toNativeCameraState,
+  toNativeLngLat,
+  toPublicCameraState,
+  fromNativeLngLat,
+} from "./internal-coordinate";
@@
  private runtimeOptions: UnifiedMapRuntimeOptions;
+  private publicViewState: CameraState;
@@
    this.runtimeOptions = {
      style: options.style,
      interactive: options.interactive,
    };
+    this.publicViewState = normalizePublicCameraState(options.initialView);
   }
@@
    this.nativeMap = this.adapter.createMap(
      { container: target },
+      this.toAdapterCreateOptions(this.getResolvedOptions(target)),
      createMapEventBridge(this),
    );
 @@
   public emitFromAdapter<K extends EventKey<MapEventMap>>(
 @@
-    return this.fire(type, payload);
+    if (type === "viewChanged" && payload && "view" in payload) {
+      this.publicViewState = payload.view;
+      return this.fire(type, payload);
+    }
+    return this.fire(type, payload);
   }
@@
   public setView(view: CameraState, transition?: CameraTransition): this {
@@
-    this.adapter.setView(this.nativeMap, view, transition);
+    this.publicViewState = normalizePublicCameraState(view);
+    this.adapter.setView(
+      this.nativeMap,
+      toNativeCameraState(this.publicViewState, this.adapter.nativeCoordinateType),
+      transition,
+    );
     return this;
   }
@@
  public getView(): CameraState {
-    if (!this.nativeMap) {
-      return this.publicViewState;
-    }
-
-    return this.adapter.getView(this.nativeMap);
+    if (!this.nativeMap) {
+      return this.publicViewState;
+    }
 +    const publicView = toPublicCameraState(
 +      this.adapter.getView(this.nativeMap),
 +      this.adapter.nativeCoordinateType,
 +    );
+    this.publicViewState = publicView;
+    return this.publicViewState;
   }
@@
   public project(lngLat: LngLatLike): ScreenPoint {
@@
-    return this.adapter.project(this.nativeMap, lngLat);
+    return this.adapter.project(
+      this.nativeMap,
+      toNativeLngLat(lngLat, this.adapter.nativeCoordinateType),
+    );
   }
@@
   public unproject(point: ScreenPoint): LngLatLiteral {
@@
-    return this.adapter.unproject(this.nativeMap, point);
+    return fromNativeLngLat(
+      this.adapter.unproject(this.nativeMap, point),
+      this.adapter.nativeCoordinateType,
+    );
   }
+
+  public distance(from: LngLatLike, to: LngLatLike): number {
+    const a = toLngLatLiteral(from);
+    const b = toLngLatLiteral(to);
+    return haversine(a.lng, a.lat, b.lng, b.lat);
+  }
+
+  public distance3d(from: LngLatLike, to: LngLatLike): number {
+    const a = toLngLatLiteral(from);
+    const b = toLngLatLiteral(to);
+    return haversine3d(
+      a.lng, a.lat, a.alt ?? 0,
+      b.lng, b.lat, b.alt ?? 0,
+    );
+  }
@@
  private getResolvedOptions(target = this.options.target): UnifiedMapOptions {
    return {
      ...this.options,
      ...this.runtimeOptions,
+      initialView: this.publicViewState,
      target,
    };
  }
+
+  private toAdapterCreateOptions(
+    options: UnifiedMapOptions,
+  ): AdapterMapCreateOptions {
+    return {
+      ...options,
+      initialView: toNativeCameraState(
+        options.initialView,
+        this.adapter.nativeCoordinateType,
+      ),
+    };
+  }
```

#### 11.3.9 `src/unified-map/core/internal-events.ts`

当前受影响的核心位置：

- `1-14`
- `37-43`
- `45-50`
- `53-74`

当前动机：

- adapter 回灌的事件不能原样穿透
- 只要 payload 里带 `lngLat`，就必须统一转回公共 `WGS84`

```diff
diff --git a/src/unified-map/core/internal-events.ts b/src/unified-map/core/internal-events.ts
@@
 import type {
@@
 } from "./events";
+import {
+  normalizeLayerEventPayloadFromNative,
+  normalizeMapEventPayloadFromNative,
+  normalizeOverlayEventPayloadFromNative,
+} from "./internal-coordinate";
@@
     emit: (type, payload) => {
-      map.emitFromAdapter(type, payload, adapterEventAccess);
+      map.emitFromAdapter(
+        type,
+        normalizeMapEventPayloadFromNative(
+          type,
+          payload,
+          map.adapter.nativeCoordinateType,
+        ),
+        adapterEventAccess,
+      );
     },
   };
 }
@@
-  layer.emitFromAdapter(type, payload, adapterEventAccess);
+  layer.emitFromAdapter(
+    type,
+    normalizeLayerEventPayloadFromNative(
+      type,
+      payload,
+      layer.attachedMap?.adapter.nativeCoordinateType,
+    ),
+    adapterEventAccess,
+  );
@@
-  overlay.emitFromAdapter(type, payload, adapterEventAccess);
+  overlay.emitFromAdapter(
+    type,
+    normalizeOverlayEventPayloadFromNative(
+      type,
+      payload,
+      overlay.attachedMap?.adapter.nativeCoordinateType,
+    ),
+    adapterEventAccess,
+  );
```

#### 11.3.10 `src/unified-map/pseudo/pseudo-adapters.ts`

当前受影响的核心位置：

- `8-21`
- `128-130`
- `141-145`
- `223-235`
- `239-243`
- `355-359`

当前动机：

- 伪适配器也必须明确 native coordinate type
- debug 输出要能看见 `alt`
- `project / unproject / setView / getView` 在签名上只吃 adapter native 类型

```diff
diff --git a/src/unified-map/pseudo/pseudo-adapters.ts b/src/unified-map/pseudo/pseudo-adapters.ts
@@
   toLngLatLiteral,
   type CameraTransition,
+  type CoordinateType,
+  type NativeCameraState,
+  type NativeLngLatLike,
+  type NativeLngLatLiteral,
@@
function formatView(view: NativeCameraState): string {
   const center = toLngLatLiteral(view.center);
-  return `center=[${center.lng}, ${center.lat}], zoom=${view.zoom}, bearing=${view.bearing ?? 0}, pitch=${view.pitch ?? 0}`;
+  const altitude = center.alt === undefined ? "" : `, alt=${center.alt}`;
+  return `center=[${center.lng}, ${center.lat}${altitude}], zoom=${view.zoom}, bearing=${view.bearing ?? 0}, pitch=${view.pitch ?? 0}`;
 }
@@
 abstract class BasePseudoAdapter extends AbstractMapAdapter {
   public abstract override readonly engine: string;
+  public abstract override readonly nativeCoordinateType: CoordinateType;
@@
+  public override setView(
+    mapHandle: unknown,
+    view: NativeCameraState,
+    transition?: CameraTransition,
+  ): void { ... }
+
+  public override getView(mapHandle: unknown): NativeCameraState { ... }
+
+  public override project(
+    mapHandle: unknown,
+    lngLat: NativeLngLatLike,
+  ): ScreenPoint { ... }
+
+  public override unproject(
+    mapHandle: unknown,
+    point: ScreenPoint,
+  ): NativeLngLatLiteral { ... }
@@
 export class PseudoMapLibreAdapter extends BasePseudoAdapter {
   public override readonly engine = "maplibre";
+  public override readonly nativeCoordinateType = "wgs84" as const;
@@
 export class PseudoBMapGLAdapter extends BasePseudoAdapter {
   public override readonly engine = "bmapgl";
+  public override readonly nativeCoordinateType = "bd09" as const;
```

#### 11.3.11 `src/unified-map/pseudo/demo-models.ts`

当前受影响的核心位置：

- `21-29`
- `119-142`
- `145-173`

当前动机：

- demo 类型要允许 `alt`
- 顺手修掉当前仓库里已有的 3 个 demo 编译错误

```diff
diff --git a/src/unified-map/pseudo/demo-models.ts b/src/unified-map/pseudo/demo-models.ts
@@
 import type {
   ControlDefinition,
   ControlSlot,
   DataLayerDefinition,
   LngLatLike,
+  PixelOffset,
+  PixelOffsetLike,
   OverlayDefinition,
@@
       type: "Point";
-      coordinates: readonly [number, number];
+      coordinates: readonly [number, number, number?];
@@
-      coordinates: ReadonlyArray<readonly [number, number]>;
+      coordinates: ReadonlyArray<readonly [number, number, number?]>;
@@
 export class DemoMarkerOverlay extends AbstractOverlay<DemoMarkerOverlayOptions> {
@@
+  public get coordinate(): DemoMarkerOverlayOptions["coordinate"] {
+    return this.options.coordinate;
+  }
+
+  public setCoordinate(coordinate: LngLatLike): this {
+    this.patchOptions({ coordinate });
+    return this;
+  }
+
   public toOverlayDefinition(): OverlayDefinition<DemoMarkerOverlayOptions> {
     return {
       id: this.id,
       kind: this.kind,
-      coordinate: this.options.coordinate,
       visible: this.options.visible,
       zIndex: this.options.zIndex,
       options: this.options,
       metadata: this.options.metadata,
     };
@@
 export class DemoNavigationControl extends AbstractControl<DemoNavigationControlOptions> {
@@
+  public get position(): ControlSlot {
+    return this.options.position ?? this.getDefaultPosition();
+  }
+
+  public get offset(): PixelOffset {
+    const raw = this.options.offset;
+    if (!raw) return { x: 0, y: 0 };
+    return Array.isArray(raw) ? { x: raw[0], y: raw[1] } : raw;
+  }
+
+  public get visible(): boolean {
+    return this.options.visible ?? true;
+  }
+
+  public setVisibility(visible: boolean): this {
+    this.patchOptions({ visible });
+    return this;
+  }
+
+  public setPosition(position: ControlSlot): this {
+    this.patchOptions({ position });
+    return this;
+  }
+
+  public setOffset(offset: PixelOffsetLike): this {
+    this.patchOptions({ offset });
+    return this;
+  }
```

#### 11.3.12 `src/unified-map/index.ts`

当前动机：

- `geo/` 需要正式进入公共导出面

```diff
diff --git a/src/unified-map/index.ts b/src/unified-map/index.ts
@@
+export * from "./geo";
 export * from "./core/adapter";
```

#### 11.3.13 `docs/unified-map-api-guide.md`

当前受影响的核心位置：

- `199-200`
- `1001-1045`
- `1129-1130`
- `1186-1191`

当前动机：

- 当前文档还把 `LngLatLike` 写成“无海拔、无 WGS84 语义”的旧定义
- 示例代码也还在传二维坐标

```diff
diff --git a/docs/unified-map-api-guide.md b/docs/unified-map-api-guide.md
@@
-| `LngLatLike` | 坐标输入，允许 `[lng, lat]` 或 `{ lng, lat }` |
-| `LngLatLiteral` | 标准化后的经纬度字面量 |
+| `LngLatLike` | WGS84 坐标输入，允许 `[lng, lat, alt?]` 或 `{ lng, lat, alt? }` |
+| `LngLatLiteral` | 标准化后的 WGS84 经纬度字面量，保留可选 `alt` |
@@
 - 地图事件：`createMapEventBridge(map)` 生成的 `eventBridge.emit(...)`
 - 图层事件：`emitLayerEvent(layer, type, payload)`
 - 覆盖物事件：`emitOverlayEvent(overlay, type, payload)`
+- 这些 bridge 会把 adapter 原生坐标统一归一回 WGS84，再交给业务层。
@@
-const point = map.project([116.404, 39.915]);
+const point = map.project([116.404, 39.915, 52]);
@@
 const lngLat = map.unproject({ x: 320, y: 180 });
-console.log(lngLat.lng, lngLat.lat);
+console.log(lngLat.lng, lngLat.lat, lngLat.alt); // alt 可能为空，取决于来源
```

#### 11.3.14 `docs/overlay-control-abstraction-plan.md`

当前受影响的核心位置：

- `260-276`
- `436-443`
- `583-587`
- `707-779`

当前动机：

- 这份标准层规划大量引用了 `LngLatLike`
- 必须补一句“这里的 `LngLatLike` 现在指 WGS84，且允许 `alt`”

```diff
diff --git a/docs/overlay-control-abstraction-plan.md b/docs/overlay-control-abstraction-plan.md
@@
 ## 5. 类图
+
+说明：
+- 本文档中的 `LngLatLike / LngLatLiteral` 均指 `core` 公共 API 下的 WGS84 坐标。
+- `alt` 是可选字段，若业务传入则 `core` 必须保留。
+- adapter 内部若需 `GCJ02 / BD09`，统一经由 `Coordinate` 转换，不直接暴露给业务层。
```

#### 11.3.15 `docs/bmapgl-implementation-plan.md`

当前受影响的核心位置：

- `505-517`

当前动机：

- 文档要明确 `BMapGLAdapter` 内部吃的是 `BD09`
- `AbstractMap.project / unproject` 对外仍是 WGS84

```diff
diff --git a/docs/bmapgl-implementation-plan.md b/docs/bmapgl-implementation-plan.md
@@
 ### 7.5 `project(runtime, lngLat)` / `unproject(runtime, point)`
+
+说明：
+- 这里的 adapter `lngLat` 是 BMapGL 原生 `BD09` 坐标。
+- `AbstractMap.project()` / `unproject()` 对外仍收发 WGS84，坐标转换由 `core` 内部完成。
```

### 11.4 当前不建议扩改的点

这次先不要做：

- 改 `core/events.ts` 字段名
- 把所有 `lngLat` 改成 `coordinate`
- 把 `core` 的对外类型改成 `Coordinate`
- 一次性把标准层文档里的全部二维示例都重写成三维示例

原因：

- 你现在已经把公共协议收口到 `WGS84 LngLatLike`
- 真正关键的是坐标系边界和 `alt` 保真
- 不必为了内部标准化把对外 API 复杂化

### 11.5 实施后的验收标准

至少满足下面这些条件，才算这次改造闭环：

1. `LngLatLike` 已经变成 `WGS84 + optional alt`
2. `Map.setView / getView / project / unproject` 对外始终只暴露 `WGS84`
3. adapter 层只使用单独命名的 native 类型，不再复用公共 `LngLatLike`
4. `PseudoMapLibreAdapter.nativeCoordinateType === "wgs84"`
5. `PseudoBMapGLAdapter.nativeCoordinateType === "bd09"`
6. 用户给过的 `alt` 在 `core` 内流转后不丢，且不会被错误继承到新点
7. `distance()` 和 `distance3d()` 可直接用
8. `npm run build` 通过
