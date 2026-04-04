## 需求判断
- 合理性：合理，但不能按“局部修几个类型别名”的思路处理。当前问题不是单点定义写法不优雅，而是 `core` 抽象边界、`standard` 具体语义层、以及事件泛型组合三处同时失衡；继续在现状上打补丁只会增加类型断言和概念漂移。
- 代码理解判断：你的判断基本准确，但需要收窄成更具体的结论。现状真正不符合最佳实践的，不是“类型太多”或“命名不好”，而是：
  - `core` 直接暴露了 MapLibre 类型与字段，抽象层已经被实现细节反向污染。
  - `standard` 重复声明了 `core` 已经表达过的 option 片段，导致类型源头分散。
  - `overlay/control` 的定义泛型不够精确，迫使实现层使用 `as never`、`as unknown as` 绕过编译器。
- 关键依据：
  - `src/core/types.ts` 直接引入 `LayerSpecification` / `SourceSpecification` / `StyleSpecification`（`L1`），并在 `SourceDefinition` / `DataLayerDefinition` 暴露 `mapLibreSource` / `mapLibreLayer`（`L156-L187`）。
  - `src/core/types.ts` 中 `OverlayKind` / `ControlKind` 仍使用开放式 `| (string & {})`（`L118-L140`），削弱了判别联合的穷举价值。
  - 旧实现里 `src/core/layer.ts` 的 `SystemLayerOptions.systemKind` 与 `SystemLayerDefinition.systemKind` 构成双真相源（`src/core/layer.ts L30-L33`，`src/core/types.ts L190-L194`）。
  - `src/standard/overlay/types.ts` 和 `src/standard/control/types.ts` 重新声明了 `visible / zIndex / position / offset / metadata`（`src/standard/overlay/types.ts L17-L31`，`src/standard/control/types.ts L17-L21`），与 `src/core/overlay.ts` / `src/core/control.ts` / `src/core/layer.ts` 重复。
  - `src/standard/overlay/base.ts`、`src/standard/overlay/anchored.ts`、`src/standard/overlay/path.ts`、`src/standard/control/base.ts` 存在 `as never` 和 `as unknown as`（`src/standard/overlay/base.ts L60-L90`，`src/standard/overlay/anchored.ts L32`，`src/standard/overlay/path.ts L23`，`src/standard/control/base.ts L58-L95`），说明当前事件和 definition 泛型关系没有被类型系统正确表达。
  - `dev/pseudo/demo-models.ts` 与 `dev/pseudo/pseudo-adapters.ts` 已经在消费 `mapLibreSource` / `mapLibreLayer`（`dev/pseudo/demo-models.ts L65-L113`，`dev/pseudo/pseudo-adapters.ts L569-L599`），因此这次改造必须附带迁移计划，不能只改 `src/core`。

## 目标
- 对外目标：
  - 让 `core` 的公共类型恢复为“引擎无关的抽象契约”，不再直接携带 MapLibre 专有字段。
  - 让 `standard` 的类型定义建立在 `core` 公共片段之上，不再复制基础 option 字段。
  - 让 `toOverlayDefinition()` / `toControlDefinition()` / `toSourceDefinition()` 返回精确判别类型，删除实现层里的断言补丁。
- 内部架构目标：
  - 建立统一的公共 option 片段与 definition 基类，减少类型源头数量。
  - 收紧 `kind` 扩展策略，让标准内建类型可穷举，自定义扩展走显式 `custom` 语义而不是任意字符串。
  - 消除 `systemKind` 双写、`event map` 组合错位、以及 adapter 反向污染 `core` 的问题。
- 明确非目标：
  - 本轮不改 `AbstractMap` 生命周期设计，不改 `capability` 体系，不重做 pseudo adapter 的运行时逻辑。
  - 本轮不试图给所有引擎设计完整插件协议；只把 MapLibre 扩展位从 `core` 挪出，并为 adapter 留一个中性的扩展挂点。
  - 本轮不保留“旧类型字段与新字段并存”的兼容层。若接受本方案，实施时按一次性重构处理。

## 可能的困难
- `overlay/control` 的事件泛型是结构性问题：只删断言而不改事件映射组合方式，会很快回到 `as never`。
- `kind` 收紧后会影响所有 `switch (definition.kind)`、`Extract<OverlayKind, ...>`、`Extract<ControlKind, ...>` 的类型推导；这是必要收缩，但需要一次性改干净。
- 文档同步不可省：仓库已有 `docs/maplibre-capability-matrix.md` 与 `docs/unified-map-api-guide.md` 明确写了 `mapLibreSource` / `mapLibreLayer`，实现后若不一起更新，文档会直接误导后续开发。
- 该需求本质上属于“先重构，再实施”。如果你不同意把 `core` 从 MapLibre 直通结构中抽离，那就不应该推进本方案，而应该改成“承认 MapLibre-first，再把命名和泛型收干净”的窄方案。

## 实现大纲
1. 先重设 `core` 类型边界
- 目标：把几何/视图/容器等基础类型，与 source/layer/overlay/control 定义契约重新分层。
- 动作：保留 `src/core/types.ts` 作为核心类型入口，但重写内容，去掉 MapLibre import 和 `mapLibreSource` / `mapLibreLayer` 直通字段，补上公共 option 片段、封闭 `kind` union、以及中性的 adapter extension 挂点。
- 原因：这是后续所有文件都依赖的根节点，不先定边界，`standard` 和 pseudo adapter 的修改都没有稳定目标。

2. 重塑 definition 泛型与 option 片段
- 目标：让 `SourceDefinition` / `OverlayDefinition` / `ControlDefinition` / `LayerDefinition` 的判别键和 options 关系显式化。
- 动作：
  - 引入 `MetadataOptions`、`VisibleOptions`、`OrderedOptions` 等公共片段。
  - `OverlayDefinition` / `ControlDefinition` 改为 `Definition<kind, options>` 形态。
  - `SystemLayerDefinition` 的 `systemKind` 只保留在 definition 顶层，`SystemLayerOptions` 去掉重复字段。
- 原因：这一步能直接消除 `standard` 的大部分重复声明，并为后续删除强制断言创造条件。

3. 修正 `core` 抽象类的 definition 与事件约束
- 目标：让 `AbstractSource` / `AbstractOverlay` / `AbstractControl` 的返回类型和事件 payload 真正受泛型约束，而不是靠下游断言。
- 动作：
  - 给 `AbstractSource` / `AbstractOverlay` / `AbstractControl` 增加 definition 泛型参数。
  - 精简 `src/core/events.ts` 中并未实际使用 `TOptions` 的 `LayerExtraEventMap` / `OverlayExtraEventMap` / `ControlExtraEventMap`。
  - 把 `standard` 需要自己发出的保留事件并入它们各自的基类 extra event 组合，而不是在实现层绕过类型系统。
- 原因：这一层不处理，`standard` 无法优雅地删除 `as never`。

4. 收口 `standard` 类型与基类实现
- 目标：让 `standard` 只表达“标准语义差异”，不重复表达基础设施类型。
- 动作：
  - `src/standard/overlay/types.ts` / `src/standard/control/types.ts` 不再重复基础 option 字段，只保留标准层新增字段。
  - `BaseStandardOverlayDefinition` / `BaseStandardControlDefinition` 改成建立在新 generic definition 上的薄包装。
  - `AbstractStandardOverlay` / `AbstractStandardControl` / `AbstractAnchoredOverlay` / `AbstractPathOverlay` 删掉所有断言。
- 原因：这是本轮能否真正落地“最佳实践”的直接判据；如果这里还需要断言，说明上游设计仍没对齐。

5. 迁移 pseudo demo 与文档
- 目标：把 adapter 依赖从 `core` 字段迁移到 adapter extension 挂点，并同步文档描述。
- 动作：
  - `dev/pseudo/demo-models.ts` 改为输出中性的 definition + `engineExtensions.maplibre`。
  - `dev/pseudo/pseudo-adapters.ts` 改为读取 `engineExtensions.maplibre`，不再读取 `mapLibreSource` / `mapLibreLayer`。
  - 更新 `docs/maplibre-capability-matrix.md`、`docs/unified-map-api-guide.md` 中关于旧直通字段的描述。
- 原因：否则实现完成后，仓库里的 demo 和文档会继续向错误方向强化现状。

6. 做一次类型收敛验证
- 目标：确认断言已删净、导出面仍自洽、demo 仍可编译。
- 动作：
  - 运行 `tsc --noEmit`。
  - 重点检查 `switch(kind)` 的穷举性、`toXxxDefinition()` 返回值精度、pseudo adapter 读取 extension 的类型收敛情况。
- 原因：本轮是“类型边界重构”，验证重点必须放在推导质量，而不是运行时功能冒烟。

## 具体实现
1. `[src/core/types.ts]`
- 变更范围：`L1-L202`，整文件重写。锚点：`SourceKind`、`LayerKind`、`OverlayKind`、`ControlKind`、`SourceDefinition`、`DataLayerDefinition`、`SystemLayerDefinition`、`OverlayDefinition`、`ControlDefinition`。
- 修改内容：
```ts
export type MetadataMap = Readonly<Record<string, unknown>>;

export interface MetadataOptions {
  metadata?: MetadataMap;
}

export interface VisibleOptions {
  visible?: boolean;
}

export interface OrderedOptions {
  zIndex?: number;
}

export interface EngineExtensionMap {
  readonly [engine: string]: unknown;
}

export interface DefinitionBase {
  id: string;
  metadata?: MetadataMap;
  engineExtensions?: EngineExtensionMap;
}

export type SourceKind =
  | "geojson"
  | "vector"
  | "raster"
  | "image"
  | "canvas"
  | "custom";

export type LayerKind =
  | "background"
  | "fill"
  | "line"
  | "symbol"
  | "circle"
  | "heatmap"
  | "fill-extrusion"
  | "raster"
  | "system"
  | "custom";

export type OverlayKind =
  | "marker"
  | "popup"
  | "dom"
  | "polyline"
  | "polygon"
  | "circle"
  | "custom";

export type ControlKind =
  | "navigation"
  | "scale"
  | "fullscreen"
  | "geolocate"
  | "attribution"
  | "custom";

export interface SourceDefinition<
  TKind extends SourceKind = SourceKind,
  TOptions extends object = object,
> extends DefinitionBase {
  kind: TKind;
  customKind?: string;
  options: TOptions;
}

export type LayerDomain = "data" | "system";
export type DataLayerKind = Exclude<LayerKind, "system">;

export interface DataLayerDefinition<
  TKind extends DataLayerKind = DataLayerKind,
  TOptions extends object = object,
> extends DefinitionBase, VisibleOptions, OrderedOptions {
  kind: TKind;
  domain: "data";
  sourceId?: string;
  beforeId?: string;
  options: TOptions;
}

export interface SystemLayerDefinition<
  TSystemKind extends string = string,
  TOptions extends object = object,
> extends DefinitionBase, VisibleOptions, OrderedOptions {
  kind: "system";
  domain: "system";
  systemKind: TSystemKind;
  options: TOptions;
}

export type LayerDefinition = DataLayerDefinition | SystemLayerDefinition;

export interface OverlayDefinition<
  TKind extends OverlayKind = OverlayKind,
  TOptions extends object = object,
> extends DefinitionBase, VisibleOptions, OrderedOptions {
  kind: TKind;
  options: TOptions;
}

export interface ControlDefinition<
  TKind extends ControlKind = ControlKind,
  TOptions extends object = object,
> extends DefinitionBase {
  kind: TKind;
  position?: ControlSlot;
  visible?: boolean;
  options: TOptions;
}
```
- 设计说明：
  - 这里必须先去掉 MapLibre import 和 `mapLibreSource` / `mapLibreLayer`。否则 `core` 永远不是抽象层。
  - `kind` 统一改成封闭 union；需要扩展时走 `kind: "custom"` + `customKind`，而不是继续允许任意字符串侵入标准判别联合。
  - `engineExtensions` 是唯一保留的 adapter 扩展位，但它本身是中性的，不再把 `maplibre` 写死在 `core`。

2. `[src/core/layer.ts]`
- 变更范围：`L13-L111`，重点重写 `BaseLayerOptions`、`DataLayerOptions`、`SystemLayerOptions`、`AbstractDataLayer`、`AbstractSystemLayer`。
- 修改内容：
```ts
export interface BaseLayerOptions extends VisibleOptions, OrderedOptions, MetadataOptions {}

export interface DataLayerStyleOptions<TPaint extends object = object> {
  sourceId?: string;
  beforeId?: string;
  layout?: Record<string, unknown>;
  paint?: TPaint;
  filter?: unknown;
  minzoom?: number;
  maxzoom?: number;
}

export interface DataLayerOptions<TPaint extends object = object>
  extends BaseLayerOptions,
    DataLayerStyleOptions<TPaint> {}

export interface SystemLayerOptions extends BaseLayerOptions {}

export abstract class AbstractDataLayer<
  TKind extends DataLayerKind = DataLayerKind,
  TPaint extends object = object,
  TOptions extends DataLayerOptions<TPaint> = DataLayerOptions<TPaint>,
  TLayerHandle = unknown,
> extends AbstractLayer<
  TOptions,
  DataLayerDefinition<TKind, TOptions>,
  TLayerHandle
> {
  public abstract override readonly kind: TKind;
  public readonly domain = "data" as const;
}

export abstract class AbstractSystemLayer<
  TSystemKind extends string = string,
  TOptions extends SystemLayerOptions = SystemLayerOptions,
  TLayerHandle = unknown,
> extends AbstractLayer<
  TOptions,
  SystemLayerDefinition<TSystemKind, TOptions>,
  TLayerHandle
> {
  public readonly kind = "system" as const;
  public readonly domain = "system" as const;
  public abstract readonly systemKind: TSystemKind;
}
```
- 设计说明：
  - `systemKind` 不能同时放在 options 和 definition。这里应该以 definition 顶层为唯一真相源，运行时 options 只存系统图层自己的参数。
  - `AbstractDataLayer` 的第一泛型改成 `TKind`，避免 `DataLayerDefinition<TPaint>` 这种“以 paint 驱动 definition 类型”的倒挂结构。

3. `[src/core/source.ts]`、`[src/core/overlay.ts]`、`[src/core/control.ts]`
- 变更范围：
  - `src/core/source.ts`：`L1-L18`
  - `src/core/overlay.ts`：`L1-L22`
  - `src/core/control.ts`：`L1-L37`
- 修改内容：
```ts
export abstract class AbstractSource<
  TOptions extends object = object,
  TDefinition extends SourceDefinition = SourceDefinition,
  TSourceHandle = unknown,
> extends AbstractMapEntity<
  TOptions,
  TSourceHandle,
  SourceExtraEventMap<TOptions>
> {
  public abstract readonly kind: TDefinition["kind"];
  public abstract toSourceDefinition(): TDefinition;
}

export abstract class AbstractOverlay<
  TOptions extends OverlayOptions = OverlayOptions,
  TDefinition extends OverlayDefinition = OverlayDefinition,
  TExtraEvents extends EventMapBase = EmptyEventMap,
  TOverlayHandle = unknown,
> extends AbstractMapEntity<
  TOptions,
  TOverlayHandle,
  OverlayExtraEventMap & TExtraEvents
> {
  public abstract readonly kind: TDefinition["kind"];
  public abstract toOverlayDefinition(): TDefinition;
}

export abstract class AbstractControl<
  TOptions extends ControlOptions = ControlOptions,
  TDefinition extends ControlDefinition = ControlDefinition,
  TExtraEvents extends EventMapBase = EmptyEventMap,
  TControlHandle = unknown,
> extends AbstractMapEntity<
  TOptions,
  TControlHandle,
  ControlExtraEventMap & TExtraEvents
> {
  public abstract readonly kind: TDefinition["kind"];
  public abstract toControlDefinition(): TDefinition;
}
```
- 设计说明：
  - 这一步是删除 `standard` 层 `as unknown as` 的前提。只要 `overlay/control/source` 基类不带 definition 泛型，下游就一定要断言。
  - `kind` 直接从 `TDefinition["kind"]` 派生，避免“基类 `kind` 类型比 definition 更宽”。

4. `[src/core/events.ts]`
- 变更范围：`L121-L233`，重写 `LayerExtraEventMap` / `OverlayExtraEventMap` / `ControlExtraEventMap` 相关定义。
- 修改内容：
```ts
export interface SourceExtraEventMap<TOptions extends object = object> extends EventMapBase {
  dataChanged: {
    id: string;
    reason: string;
    options: Readonly<TOptions>;
  };
}

export type LayerExtraEventMap =
  LayerStateEventMap &
  LayerMouseEventMap &
  LayerTouchEventMap;

export type OverlayExtraEventMap =
  OverlayMouseEventMap &
  OverlayTouchEventMap &
  OverlayDragEventMap;

export type ControlExtraEventMap = ControlStateEventMap;
```
- 设计说明：
  - 当前 `LayerExtraEventMap<TOptions>` / `OverlayExtraEventMap<TOptions>` / `ControlExtraEventMap<TOptions>` 并没有真正使用 `TOptions`，保留这个泛型只会让事件组合更难推导。
  - 这一步不是“为了简洁而简洁”，而是为了让 `standard` 基类拼接自己的保留事件时不再掉进 `never`。

5. `[src/standard/overlay/types.ts]`
- 变更范围：`L12-L148`，重写 `StandardOverlayKind`、`StandardOverlayOptions`、`BaseStandardOverlayDefinition`、各具体 definition。
- 修改内容：
```ts
export type StandardOverlayKind =
  | "marker"
  | "popup"
  | "dom"
  | "polyline"
  | "polygon"
  | "circle";

export interface StandardOverlayOptions extends OverlayOptions {
  minZoom?: number;
  maxZoom?: number;
}

export type MarkerOverlayDefinition =
  OverlayDefinition<"marker", MarkerOverlayOptions> & {
    popupId?: string;
  };

export type PopupOverlayDefinition =
  OverlayDefinition<"popup", PopupOverlayOptions>;

export type DomOverlayDefinition =
  OverlayDefinition<"dom", DomOverlayOptions>;

export type PolylineOverlayDefinition =
  OverlayDefinition<"polyline", PolylineOverlayOptions>;

export type PolygonOverlayDefinition =
  OverlayDefinition<"polygon", PolygonOverlayOptions>;

export type CircleOverlayDefinition =
  OverlayDefinition<"circle", CircleOverlayOptions>;
```
- 设计说明：
  - `StandardOverlayOptions` 不应重复声明 `visible / zIndex / metadata`，这些字段在 `OverlayOptions` 已经存在。
  - 这里不再保留 `BaseStandardOverlayDefinition extends OverlayDefinition<TOptions> { kind: TKind }` 这种“先宽后窄”的模式，直接把 `kind` 放进 definition 泛型。

6. `[src/standard/control/types.ts]`
- 变更范围：`L12-L91`，重写 `StandardControlKind`、`StandardControlOptions`、各具体 definition。
- 修改内容：
```ts
export type StandardControlKind =
  | "navigation"
  | "scale"
  | "fullscreen"
  | "geolocate"
  | "attribution";

export interface StandardControlOptions extends ControlOptions {}

export type NavigationControlDefinition =
  ControlDefinition<"navigation", NavigationControlOptions>;

export type ScaleControlDefinition =
  ControlDefinition<"scale", ScaleControlOptions>;

export type FullscreenControlDefinition =
  ControlDefinition<"fullscreen", FullscreenControlOptions>;

export type GeolocateControlDefinition =
  ControlDefinition<"geolocate", GeolocateControlOptions>;

export type AttributionControlDefinition =
  ControlDefinition<"attribution", AttributionControlOptions>;
```
- 设计说明：
  - `StandardControlOptions` 当前只是把 `ControlOptions` 的字段重新写一遍，没有提供新的表达能力，应直接收掉。
  - 这一层完成后，`Extract<ControlKind, ...>` 也不再需要。

7. `[src/standard/overlay/base.ts]`、`[src/standard/overlay/anchored.ts]`、`[src/standard/overlay/path.ts]`
- 变更范围：
  - `src/standard/overlay/base.ts`：`L1-L90`
  - `src/standard/overlay/anchored.ts`：`L1-L43`
  - `src/standard/overlay/path.ts`：`L1-L57`
- 修改内容：
```ts
interface StandardOverlayStateEventMap extends EventMapBase {
  visibilityChanged: { id: string; visible: boolean };
  zIndexChanged: { id: string; zIndex: number | undefined };
}

export abstract class AbstractStandardOverlay<
  TOptions extends StandardOverlayOptions,
  TDefinition extends StandardOverlayDefinition,
  TExtraEvents extends EventMapBase = EmptyEventMap,
  TOverlayHandle = unknown,
> extends AbstractOverlay<
  TOptions,
  TDefinition,
  StandardOverlayStateEventMap & Omit<TExtraEvents, keyof StandardOverlayStateEventMap>,
  TOverlayHandle
> {
  public setVisibility(visible: boolean): this {
    if (visible === this.visible) {
      return this;
    }

    this.patchOptions({ visible } as Partial<TOptions>);
    this.fire("visibilityChanged", { id: this.id, visible });
    return this;
  }

  public setZIndex(zIndex: number | undefined): this {
    this.patchOptions({ zIndex } as Partial<TOptions>);
    this.fire("zIndexChanged", { id: this.id, zIndex });
    return this;
  }
}
```
- 设计说明：
  - 这里的核心目标不是“换一种写法”，而是让 `visibilityChanged` / `zIndexChanged` 成为基类真实拥有的事件，而不是通过断言偷渡。
  - `AbstractAnchoredOverlay` / `AbstractPathOverlay` 按同样方式把 `coordinateChanged` / `coordinatesChanged` 合入泛型组合后，`as never` 可以全部删除。

8. `[src/standard/control/base.ts]`
- 变更范围：`L1-L95`，重写 `StandardControlReservedEventMap` 组合方式，并删除 `toControlDefinition()` 断言。
- 修改内容：
```ts
interface StandardControlStateEventMap extends EventMapBase {
  positionChanged: { id: string; position: ControlSlot };
  visibilityChanged: { id: string; visible: boolean };
  offsetChanged: { id: string; offset: PixelOffset };
}

export abstract class AbstractStandardControl<
  TOptions extends StandardControlOptions,
  TDefinition extends StandardControlDefinition,
  TExtraEvents extends EventMapBase = EmptyEventMap,
  TControlHandle = unknown,
> extends AbstractControl<
  TOptions,
  TDefinition,
  StandardControlStateEventMap & Omit<TExtraEvents, keyof StandardControlStateEventMap>,
  TControlHandle
> {
  public setVisibility(visible: boolean): this {
    if (visible === this.visible) {
      return this;
    }

    this.patchOptions({ visible } as Partial<TOptions>);
    this.fire("visibilityChanged", { id: this.id, visible });
    return this;
  }

  public setPosition(position: ControlSlot): this {
    this.patchOptions({ position } as Partial<TOptions>);
    this.fire("positionChanged", { id: this.id, position });
    return this;
  }

  public setOffset(offset: PixelOffsetLike): this {
    const next = normalizePixelOffset(offset);
    const current = this.offset;

    if (current.x === next.x && current.y === next.y) {
      return this;
    }

    this.patchOptions({ offset } as Partial<TOptions>);
    this.fire("offsetChanged", { id: this.id, offset: next });
    return this;
  }
}
```
- 设计说明：
  - 这里应与 `AbstractStandardOverlay` 做同构处理。只要一个地方还依赖断言，说明公共事件模型仍未统一。

9. `[dev/pseudo/demo-models.ts]`
- 变更范围：`L1-L113`，重写 `DemoGeoJsonSource.toSourceDefinition()` 与 `DemoLineLayer.toLayerDefinition()` 的输出结构。
- 修改内容：
```ts
import type {
  DataLayerDefinition,
  SourceDefinition,
} from "@/core/types";
import type {
  LayerSpecification,
  SourceSpecification,
} from "maplibre-gl";

type MapLibreExtensionMap = {
  maplibre?: {
    source?: SourceSpecification;
    layer?: LayerSpecification;
  };
};

public toSourceDefinition(): SourceDefinition<"geojson", DemoGeoJsonSourceOptions> {
  return {
    id: this.id,
    kind: this.kind,
    options: this.options,
    engineExtensions: {
      maplibre: {
        source: {
          type: "geojson",
          data: this.options.data,
          cluster: this.options.cluster,
          tolerance: this.options.tolerance,
        } as unknown as SourceSpecification,
      },
    } satisfies MapLibreExtensionMap,
  };
}

public toLayerDefinition(): DataLayerDefinition<"line", DemoLineLayerOptions> {
  return {
    id: this.id,
    domain: "data",
    kind: "line",
    sourceId: this.options.sourceId,
    beforeId: this.options.beforeId,
    visible: this.options.visible,
    zIndex: this.options.zIndex,
    metadata: this.options.metadata,
    options: this.options,
    engineExtensions: {
      maplibre: {
        layer: {
          id: this.id,
          type: "line",
          source: this.options.sourceId,
          paint: this.options.paint,
          layout: this.options.layout,
          filter: this.options.filter as never,
        } as LayerSpecification,
      },
    } satisfies MapLibreExtensionMap,
  };
}
```
- 设计说明：
  - MapLibre 具体结构应留在 demo / adapter 侧，而不是塞回 `core`。
  - 这里仍保留 `LayerSpecification` / `SourceSpecification` 是合理的，因为该文件本来就是 MapLibre demo 适配样例，不是抽象层。

10. `[dev/pseudo/pseudo-adapters.ts]`
- 变更范围：`L569-L599` 以及所有读取 `definition.kind` / `definition.sourceId` 的逻辑附近。锚点：`mountSource()`、`mountLayer()`。
- 修改内容：
```ts
function getMapLibreSourceExtension(definition: SourceDefinition): unknown {
  return (definition.engineExtensions?.maplibre as { source?: unknown } | undefined)?.source;
}

function getMapLibreLayerExtension(definition: LayerDefinition): unknown {
  return (definition.engineExtensions?.maplibre as { layer?: unknown } | undefined)?.layer;
}

public override mountSource(
  _mapHandle: PseudoNativeMap,
  source: AbstractSource,
): PseudoHandles["source"] {
  const definition = source.toSourceDefinition();
  this.record(
    `[maplibre] map.addSource("${source.id}", ${shortJson(
      getMapLibreSourceExtension(definition) ?? definition.options,
    )})`,
  );
  return { type: "source", id: source.id };
}

public override mountLayer(
  _mapHandle: PseudoNativeMap,
  layer: AbstractLayer,
): PseudoHandles["layer"] {
  const definition = layer.toLayerDefinition();
  this.record(
    `[maplibre] map.addLayer(${shortJson(
      definition.domain === "data"
        ? getMapLibreLayerExtension(definition) ?? definition.options
        : definition,
    )})`,
  );
  return { type: "layer", id: layer.id };
}
```
- 设计说明：
  - pseudo adapter 应只读取自己的 extension 挂点，不应再反向要求 `core` 暴露某个引擎的专有字段。
  - 这里是本轮重构最容易遗漏的断点之一，必须跟 `src/core/types.ts` 同步落地。

11. `[docs/maplibre-capability-matrix.md]`、`[docs/unified-map-api-guide.md]`
- 变更范围：
  - `docs/maplibre-capability-matrix.md`：所有提到 `mapLibreSource` / `mapLibreLayer` 的段落。
  - `docs/unified-map-api-guide.md`：`L224-L225`、`L777-L794` 及相关表格说明。
- 修改内容：
```md
- 旧表述：`SourceDefinition.mapLibreSource`
- 新表述：`SourceDefinition.engineExtensions?.maplibre.source`

- 旧表述：`DataLayerDefinition.mapLibreLayer`
- 新表述：`DataLayerDefinition.engineExtensions?.maplibre.layer`

- 旧结论：core 直接提供 MapLibre 直通槽位
- 新结论：core 只提供中性 definition + engineExtensions，MapLibre 具体结构下沉到 adapter / demo 侧
```
- 设计说明：
  - 文档必须跟随边界变化更新，否则仓库下一位维护者会继续把 MapLibre 细节往 `core` 塞回去。

12. `[src/index.ts]`
- 变更范围：`L1-L11`，保持导出面不变，但需要在重构完成后做一次显式核对。
- 修改内容：
```ts
export * from "@/core/adapter";
export * from "@/core/capability";
export * from "@/core/control";
export * from "@/core/entity";
export * from "@/core/events";
export * from "@/core/layer";
export * from "@/core/map";
export * from "@/core/overlay";
export * from "@/core/source";
export * from "@/core/types";
export * from "@/standard";
```
- 设计说明：
  - 这里不建议同时做 barrel 重构。当前问题核心在类型边界，不在导出组织；避免把无关重排混进本轮。

13. 验证与实施顺序
- 变更范围：实施步骤而非单文件。
- 修改内容：
```text
第一步：重写 src/core/types.ts
第二步：同步 src/core/layer.ts、src/core/source.ts、src/core/overlay.ts、src/core/control.ts、src/core/events.ts
第三步：重写 src/standard/overlay/types.ts、src/standard/control/types.ts
第四步：删除 standard 基类中的所有断言
第五步：迁移 dev/pseudo/demo-models.ts 与 dev/pseudo/pseudo-adapters.ts
第六步：更新 docs/maplibre-capability-matrix.md 与 docs/unified-map-api-guide.md
第七步：运行 tsc --noEmit，并确认仓库内不存在 as never / as unknown as 用于绕过本轮类型问题
```
- 设计说明：
  - 顺序不能颠倒。若先改 `standard`，会因为 `core` definition 还没重写而陷入临时兼容代码；这正是本方案明确要避免的补丁式实现。

## 结论
- 这项工作应按“先重构边界，再收敛实现”的路径推进，而不是在当前文件上逐个补类型断言。
- 若你同意这个方向，实施时应该一次性移除 `mapLibreSource` / `mapLibreLayer` 与开放式 `kind` 字符串策略，不保留兼容层。
- 若你不同意把 MapLibre 扩展位从 `core` 抽离，那就应该改成一份更窄的 MapLibre-first 方案，而不是执行本文方案。
