# Core / Standard 类型收敛重构计划（2026-04 复核版）

## 结论
- 旧版 plan 已经过时，不能继续作为实施依据。
- 如果问题定义只是“`core` 是否还直接暴露 MapLibre 专有字段、`kind` 是否还是开放字符串、pseudo adapter 是否还依赖旧直通字段”，那么这些问题已经基本解决。
- 如果目标是“让 `core` 抽象类返回精确 definition 类型、让 `standard` 层去掉 `as never` / `as unknown as`、让 definition 和事件泛型真正对齐”，那这项工作还没有完成，而且仍然值得做。

## 复核结果

### 已解决，不再作为本计划目标
- `src/core/types.ts` 已经改成 `engineExtensions` 扩展位，`mapLibreSource` / `mapLibreLayer` 已不在 `core` 公共类型里。
- `SourceKind` / `LayerKind` / `OverlayKind` / `ControlKind` 已经是封闭联合，不再是旧版开放字符串方案。
- `SystemLayerOptions` 已不再重复声明 `systemKind`，双真相源问题已经消失。
- `dev/pseudo/pseudo-adapters.ts` 已经改为读取 `engineExtensions?.maplibre`，不再依赖旧字段。
- `docs/maplibre-capability-matrix.md` 已经同步到 `engineExtensions?.maplibre.*` 的表述。

### 仍然存在的真实问题
1. `core` definition 泛型还不够精确
- `SourceDefinition<TOptions>`、`OverlayDefinition<TOptions>`、`ControlDefinition<TOptions>` 现在只对 `options` 泛型化，没有把 `kind` 纳入泛型。
- 对应地，`AbstractSource` / `AbstractOverlay` / `AbstractControl` 只能返回宽类型 definition，下游只能再手动收窄。
- `AbstractDataLayer` 目前仍然通过 `DataLayerDefinition<TPaint>` 绑定 definition，`kind` 没有进入主泛型，表达能力偏弱。

2. `standard` 还在重复做“先宽后窄”的收口
- `src/standard/overlay/types.ts` 的 `BaseStandardOverlayDefinition` 仍然是 `extends OverlayDefinition<TOptions> { kind: TKind }`。
- `src/standard/control/types.ts` 的 `BaseStandardControlDefinition` 也是同样模式。
- 这说明 `core` definition 还没有提供足够精确的泛型入口，所以 `standard` 只能补一层“二次收窄”。

3. 事件泛型组合仍然有结构性错位
- `src/standard/overlay/base.ts`
- `src/standard/overlay/anchored.ts`
- `src/standard/overlay/path.ts`
- `src/standard/control/base.ts`

这些文件里还存在 `as never` 和 `as unknown as`。项目虽然能通过 `tsc --noEmit`，但目前是靠断言绕过了类型系统，而不是类型模型已经收敛完成。

4. `standard` 基础 options 仍有重复声明
- `StandardOverlayOptions extends OverlayOptions` 后，又重复写了 `visible` / `zIndex` / `metadata`。
- `StandardControlOptions extends ControlOptions` 后，又重复写了 `position` / `offset` / `visible` / `metadata`。
- 这些重复不会导致运行时问题，但会继续制造类型源头分散。

## 本轮目标
- 让 `AbstractSource` / `AbstractOverlay` / `AbstractControl` / `AbstractLayer` 的 definition 返回类型足够精确。
- 删除 `standard` 层为了补齐精度而加入的 `as never` / `as unknown as`。
- 收敛 `standard` 对基础 options 和 definition 的重复声明。
- 保持当前 `engineExtensions`、`systemKind`、pseudo adapter 迁移成果不回退。

## 非目标
- 不重写 `core/types.ts` 的整体结构；本轮不是回到旧 plan 那种“大拆大改”。
- 不撤回 `engineExtensions` 方案，也不重新讨论 MapLibre 是否应该回流进 `core`。
- 不改地图运行时生命周期、capability 体系、adapter 的运行时行为。
- 不把 `dev/pseudo/demo-models.ts` 中面向 MapLibre schema 的局部断言当作本轮主目标；本轮优先处理统一抽象层自身的类型错位。

## 重构原则
- 先收紧 `core` 泛型入口，再删 `standard` 断言；顺序不能反。
- 优先保留当前运行时形状，只调整类型表达，不顺带做运行时重构。
- 尽量让 `standard` 变成 `core` 的直接特化，而不是额外包一层“补丁类型”。
- 精确 definition 返回类型只服务于“实体实现类”和“局部消费点”的类型收敛；`AbstractMap` 里的 registry 继续保持宽类型存储，不在本轮一起泛型化。

## 实施方案

### 第一阶段：补齐 `core` definition 泛型
目标：让 definition 自身可以同时表达 `kind` 和 `options`，给抽象类提供准确返回类型。

建议调整：

```ts
export interface SourceDefinition<
  TKind extends SourceKind = SourceKind,
  TOptions extends object = object,
> {
  id: string;
  kind: TKind;
  options: TOptions;
  metadata?: Record<string, unknown>;
  engineExtensions?: EngineExtensionMap;
}

export interface OverlayDefinition<
  TKind extends OverlayKind = OverlayKind,
  TOptions extends object = object,
> {
  id: string;
  kind: TKind;
  visible?: boolean;
  zIndex?: number;
  options: TOptions;
  metadata?: Record<string, unknown>;
}

export interface ControlDefinition<
  TKind extends ControlKind = ControlKind,
  TOptions extends object = object,
> {
  id: string;
  kind: TKind;
  position?: ControlSlot;
  visible?: boolean;
  options: TOptions;
  metadata?: Record<string, unknown>;
}
```

对图层，建议最小化收口，而不是像旧 plan 那样重做 shape：

```ts
export interface DataLayerDefinition<
  TKind extends DataLayerKind = DataLayerKind,
  TPaint extends object = object,
> extends BaseLayerDefinition<"data", TKind> {
  sourceId?: string;
  beforeId?: string;
  layout?: Record<string, unknown>;
  paint?: TPaint;
  filter?: unknown;
  minZoom?: number;
  maxZoom?: number;
  engineExtensions?: EngineExtensionMap;
}
```

说明：
- 本轮不建议把 `DataLayerDefinition` 改成 `options` 包裹式结构。当前项目已经围绕扁平 layer definition 写了 adapter 和 demo，这部分没有必要重新推倒。

### 第二阶段：让 `core` 抽象类直接返回精确 definition
目标：消除“基类返回宽类型，子类再强制断言”的根源。

建议调整：

```ts
export abstract class AbstractSource<
  TOptions extends object = object,
  TDefinition extends SourceDefinition = SourceDefinition,
  TSourceHandle = unknown,
> extends AbstractMapEntity<...> {
  public abstract readonly kind: TDefinition["kind"];
  public abstract toSourceDefinition(): TDefinition;
}

export abstract class AbstractOverlay<
  TOptions extends OverlayOptions = OverlayOptions,
  TDefinition extends OverlayDefinition = OverlayDefinition,
  TExtraEvents extends EventMapBase = EmptyEventMap,
  TOverlayHandle = unknown,
> extends AbstractMapEntity<...> {
  public abstract readonly kind: TDefinition["kind"];
  public abstract toOverlayDefinition(): TDefinition;
}

export abstract class AbstractControl<
  TOptions extends ControlOptions = ControlOptions,
  TDefinition extends ControlDefinition = ControlDefinition,
  TExtraEvents extends EventMapBase = EmptyEventMap,
  TControlHandle = unknown,
> extends AbstractMapEntity<...> {
  public abstract readonly kind: TDefinition["kind"];
  public abstract toControlDefinition(): TDefinition;
}
```

图层建议同步处理：
- `AbstractDataLayer` 增加 `TKind` 泛型，返回 `DataLayerDefinition<TKind, TPaint>`。
- `AbstractSystemLayer` 保持当前 runtime 结构，但 definition 返回类型继续精确绑定 `systemKind`。

消费边界说明：
- [map.ts](e:\Projects\map-api-2\src\core\map.ts) 里的 `sources` / `layers` / `overlays` / `controls` registry 继续存宽类型实体，这一层的职责是生命周期管理，不是保留每个具体 definition 的精确联合。
- `toXxxDefinition()` 的精确返回主要用于两类场景：
  - 具体实体实现类内部，避免 `toStandardOverlayDefinition()` / `toStandardControlDefinition()` 再向宽接口强制转型。
  - 局部消费点在拿到具体实体实例时，能直接获得精确 `definition.kind`。
- 像 capability 检查、adapter materialize、registry 存储这类公共流程，仍然接受宽 definition 接口；本轮不把整张公共流程链路改成“端到端精确泛型传递”。

### 第三阶段：精简事件模型，删除 `standard` 断言
目标：让 `visibilityChanged` / `zIndexChanged` / `positionChanged` / `coordinateChanged` 这类事件真正属于基类事件图，而不是靠断言硬塞。

建议调整：
- `LayerExtraEventMap` 去掉未实际使用的 `TOptions` 泛型。
- `OverlayExtraEventMap` 去掉未实际使用的 `TOptions` 泛型。
- `ControlExtraEventMap` 去掉未实际使用的 `TOptions` 泛型。
- `OverlayStateEventMap` / `ControlStateEventMap` 继续留在 `core/events.ts`，作为 overlay / control 状态事件的唯一真相源。
- `AbstractStandardOverlay` / `AbstractStandardControl` 不再重新声明 `visibilityChanged` / `zIndexChanged` / `positionChanged` / `offsetChanged` 这类 core 已有状态事件。
- `AbstractAnchoredOverlay` / `AbstractPathOverlay` 把自身事件映射合入泛型组合后，删除 `as never`。

目标代码形态示例：

```ts
export abstract class AbstractStandardOverlay<
  TOptions extends StandardOverlayOptions,
  TDefinition extends StandardOverlayDefinition,
  TExtraEvents extends EventMapBase = EmptyEventMap,
  TOverlayHandle = unknown,
> extends AbstractOverlay<
  TOptions,
  TDefinition,
  TExtraEvents,
  TOverlayHandle
> {
  public setVisibility(visible: boolean): this {
    this.patchOptions({ visible } as Partial<TOptions>);
    this.fire("visibilityChanged", { id: this.id, visible });
    return this;
  }
}
```

```ts
export type LayerExtraEventMap =
  LayerStateEventMap &
  LayerMouseEventMap &
  LayerTouchEventMap;

export type OverlayExtraEventMap =
  OverlayStateEventMap &
  OverlayMouseEventMap &
  OverlayTouchEventMap &
  OverlayDragEventMap;

export type ControlExtraEventMap = ControlStateEventMap;
```

说明：
- 这里的重点不是“standard 再补一份保留状态事件”，而是“让 core 保持唯一状态事件源，standard 只附加自己新增的事件”。
- 当前 `OverlayExtraEventMap` / `ControlExtraEventMap` 已经包含这些状态事件，因此新方案不能再在 `standard` 层重复声明同名键。
- `Omit` 只应保留给 `standard` 自己新增事件的去重场景；不能再用于包裹 core 已有状态事件。
- 若实现后仍然需要在 `fire()` 处写 `as never`，说明事件图组合方式仍然不对，不能接受。
- 若在移除重复 state 事件后断言仍然残留，再检查 [entity.ts](e:\Projects\map-api-2\src\core\entity.ts) 中 `AbstractMapEntity.fire()` 的 overload 是否妨碍事件推导；这属于条件性排查，不是本轮事件设计的主路径。

这一阶段完成后，应删除：
- `src/standard/overlay/base.ts` 中 `toOverlayDefinition()` 的 `as unknown as`
- `src/standard/control/base.ts` 中 `toControlDefinition()` 的 `as unknown as`
- overlay / control 基类里的所有 `as never`

### 第四阶段：收掉 `standard` 的重复定义
目标：让 `standard` 只表达标准语义，不重复表达 `core` 已有字段。

建议调整：
- `StandardOverlayOptions` 只保留 `minZoom` / `maxZoom` 等标准层新增字段。
- `StandardControlOptions` 直接继承 `ControlOptions`，不重复声明已有属性。
- `BaseStandardOverlayDefinition` / `BaseStandardControlDefinition` 删除，改成基于 `core` definition 泛型的直接特化。
- 具体 definition 不把 `OverlayDefinition<...> & {...}` / `ControlDefinition<...> & {...}` 当成主模式，优先使用 `interface extends`，避免后续在 `switch (definition.kind)` 场景里引入不必要的收窄不确定性。

示例：

```ts
export interface MarkerOverlayDefinition
  extends OverlayDefinition<"marker", MarkerOverlayOptions> {
  popupId?: string;
}

export interface NavigationControlDefinition
  extends ControlDefinition<"navigation", NavigationControlOptions> {}
```

### 第五阶段：清理受影响实现和文档
目标：把泛型签名变化带来的编译影响一次性收完。

重点文件：
- `src/standard/overlay/*`
- `src/standard/control/*`
- `dev/pseudo/demo-models.ts`
- `docs/unified-map-api-guide.md`

说明：
- pseudo adapter 本身已经完成了 `engineExtensions` 迁移，本轮主要是跟随抽象类泛型签名做编译修正。
- 文档不需要再强调“从 MapLibre 字段迁移到 `engineExtensions`”，因为这部分已经是现状；本轮只需要更新新的泛型示例和类签名。

## 推荐实施顺序
1. 修改 `src/core/types.ts` 中 definition 泛型签名。
2. 修改 `src/core/source.ts`、`src/core/overlay.ts`、`src/core/control.ts`、`src/core/layer.ts`。
3. 修改 `src/core/events.ts`，移除无意义的 `TOptions` 泛型。
4. 修改 `src/standard/overlay/types.ts`、`src/standard/control/types.ts`。
5. 删除 `src/standard/overlay/*` 与 `src/standard/control/base.ts` 中的断言。
6. 修正具体 overlay / control / demo 类的编译影响。
7. 更新 `docs/unified-map-api-guide.md` 的类型示例。

## 验证标准
- `npx tsc --noEmit` 通过。
- `src/standard/overlay` 与 `src/standard/control` 不再存在为本轮问题服务的 `as never` / `as unknown as`。
- `toSourceDefinition()` / `toOverlayDefinition()` / `toControlDefinition()` / `toLayerDefinition()` 在调用点能推导出精确 `kind`。
- `switch (definition.kind)` 在 standard 相关分支上不再依赖额外手动收窄。

典型验证调用点：
- [capability.ts](e:\Projects\map-api-2\src\core\capability.ts) 中 `getOverlayRequiredCapabilities()` 与 `getControlRequiredCapabilities()` 的 `switch (definition.kind)` 仍然可正常收窄。
- [pseudo-adapters.ts](e:\Projects\map-api-2\dev\pseudo\pseudo-adapters.ts) 中 `describeOverlayDefinition()` 与 `describeControlDefinition()` 的 `switch (definition.kind)` 不因 definition 重写而退化。
- [map.ts](e:\Projects\map-api-2\src\core\map.ts) 中 registry 仍保持宽类型实体存储，但 `assertOverlayCapabilities()` / `assertControlCapabilities()` 可以继续消费宽 definition。
- [base.ts](e:\Projects\map-api-2\src\standard\overlay\base.ts)、[anchored.ts](e:\Projects\map-api-2\src\standard\overlay\anchored.ts)、[path.ts](e:\Projects\map-api-2\src\standard\overlay\path.ts)、[base.ts](e:\Projects\map-api-2\src\standard\control\base.ts) 中原先依赖断言的 `fire()` 和 `toXxxDefinition()` 已全部去断言。

## 风险与取舍
- 这轮改造会改动抽象基类泛型参数顺序，影响面不小，但大多是编译期迁移，不是运行时重构。
- 若强行保持旧抽象类签名不动，就很难把 `standard` 层断言真正删干净。
- 事件模型这部分必须保持“唯一真相源”原则：overlay / control 的状态事件继续由 `core/events.ts` 提供，不能在 `standard` 再复制一份同名事件图。
- 相比旧版 plan，本版刻意不再扩大到 `engineExtensions`、pseudo adapter 边界、或 layer definition shape 重做，因为那些要么已经完成，要么不是当前最主要的技术债。

## 最终判断
- “MapLibre 污染 core” 这个问题，已经基本解决。
- “core 与 standard 的类型模型已经完全收敛” 这个判断，目前还不能成立。
- 因此，这份 plan 需要保留，但应收敛为一次更窄、更准确的“definition 泛型与事件模型收口”重构，而不是继续沿用旧版的大范围方案。
