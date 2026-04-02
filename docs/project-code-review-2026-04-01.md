# 项目代码审查记录（2026-04-01）

## 1. 审查范围

本次审查覆盖 `src/` 下的统一地图抽象实现，重点检查以下五个维度：

- 代码是否优雅，是否符合语言最佳实践
- 是否存在过度封装
- 代码架构是否混乱，是否有明显补丁感
- 类型是否过于宽泛，是否依赖断言逃避建模
- 是否存在过度设计，尤其是验证与对象边界是否符合以下原则

边界原则如下：

- 用户 -> core：完全不信任，需要验证、转换、重组
- core -> adapter：完全信任，不做运行时验证，但必须有完整类型
- adapter -> core：完全信任，不做运行时验证，但必须有完整类型
- core -> 用户：完全不信任，不能把内部对象未经深拷贝直接外传

补充说明：

- 本次审查以源码结构、类型设计、生命周期和对象边界为主。
- `dist/` 为构建产物，不作为审查重点。
- 已执行 `npm run build`，构建通过。
- 项目当前没有测试文件，因此以下结论主要来自静态阅读和编译验证。

## 2. 总体判断

项目主线分层是成立的：

- `Map -> Adapter -> Capability` 的职责边界总体清楚
- `strict: true` 已开启，说明作者有类型约束意识
- `core/`、`standard/`、`pseudo/` 三层的意图可以辨认

但当前实现存在几个结构性问题：

- 生命周期在失败路径上不完整
- 用户对象与内部对象之间缺少边界隔离
- `core <-> adapter` 没有建立完整类型，只是用 `unknown` 和断言维持表面泛型
- `standard` 层存在较多重复样板，部分抽象没有真实复用价值
- 同类概念在不同层的抽象深度不一致，出现明显补丁感

## 3. 结论总览

| 编号 | 维度 | 结论 | 严重度 |
| --- | --- | --- | --- |
| 1 | 架构 / 生命周期 | `mount()` 缺少失败回滚，可能把地图留在半挂载状态 | 高 |
| 2 | 边界 / 验证 | 用户对象直接进入 core，core 又直接外泄内部对象，违反边界原则 | 高 |
| 3 | 类型设计 | `core <-> adapter` 大面积使用 `unknown`，静态分析能力不足 | 中高 |
| 4 | 类型设计 | 多处依赖断言而不是建模来完成类型收敛 | 中 |
| 5 | 封装设计 | `standard` 和 `pseudo` 层存在较多薄包装和重复样板 | 中 |
| 6 | 架构一致性 | `layer`、`overlay`、`control` 的抽象深度不一致，有补丁感 | 中 |

## 4. 详细问题

### 4.1 `mount()` 缺少失败回滚，生命周期不完整

#### 结论

`AbstractMap.mount()` 在创建底层地图实例后，依次 materialize `source`、`layer`、`overlay`、`control`。但如果中途任何一步抛错，前面已经挂载成功的对象不会被清理，`nativeMap` 也不会被撤销，地图会停留在半挂载状态。

这不是代码风格问题，而是明确的生命周期一致性问题。

#### 影响

- 对象注册表与底层真实状态可能不一致
- 再次调用 `mount()`、`destroy()` 或增删实体时，行为会变得不可预测
- 后续 adapter 实现一旦从 demo 走向真实 SDK，这个问题会扩大

#### 证据

| 位置 | 说明 |
| --- | --- |
| `src/unified-map/core/map.ts:127` | `this.nativeMap = this.adapter.createMap(...)`，在所有实体 materialize 前就写入挂载状态 |
| `src/unified-map/core/map.ts:133` | 开始 materialize source |
| `src/unified-map/core/map.ts:137` | 开始 materialize layer |
| `src/unified-map/core/map.ts:141` | 开始 materialize overlay |
| `src/unified-map/core/map.ts:145` | 开始 materialize control |
| `src/unified-map/core/map.ts:584` | overlay materialize 前还会做 capability assert，可能直接抛错 |
| `src/unified-map/core/map.ts:608` | control materialize 前同样可能抛错 |
| `src/unified-map/core/map.ts:112-155` | 整个 `mount()` 没有 `try/finally` 或回滚逻辑 |

#### 判断

这部分不符合最佳实践。生命周期操作是典型的“要么全部成功，要么回滚”的场景。

### 4.2 用户对象进入 core 后未重组，core 又直接外泄内部对象

#### 结论

当前实现没有严格执行对象边界原则：

- 用户传入的 `options` 基本直接保存引用
- 对外 getter 和 definition 导出又直接返回内部对象
- 某些 getter 甚至直接返回内部对象本体，而不是副本

这会导致调用方绕过事件系统、绕过 `patchOptions()`、绕过生命周期约束，直接篡改内部状态。

#### 影响

- 违反“用户 -> core 完全不信任”的要求
- 违反“core -> 用户 不能直接外传内部对象”的要求
- 对象状态可能静默变化，事件系统和 adapter 更新无法感知

#### 证据

##### 进入 core 时直接保存引用

| 位置 | 说明 |
| --- | --- |
| `src/unified-map/core/entity.ts:37` | `this.optionsValue = initialOptions`，直接保留调用方传入对象 |
| `src/unified-map/core/map.ts:77` | `this.options = options`，直接保留地图配置对象 |
| `src/unified-map/pseudo/pseudo-adapters.ts:312` | `view: options.initialView`，底层 runtime 直接复用外部对象引用 |

##### core 对外直接返回内部对象

| 位置 | 说明 |
| --- | --- |
| `src/unified-map/core/entity.ts:55` | `options` getter 直接返回 `this.optionsValue` |
| `src/unified-map/core/entity.ts:179` | `snapshot().options` 直接暴露内部 options |
| `src/unified-map/core/map.ts:243` | 未挂载时直接返回 `this.options.initialView` |
| `src/unified-map/standard/overlay/anchored.ts:28` | `coordinate` getter 直接返回内部坐标对象 |
| `src/unified-map/standard/overlay/path.ts:22` | `coordinates` getter 直接返回内部数组 |
| `src/unified-map/standard/common/geometry.ts:12` | `normalizePixelOffset()` 在对象分支直接返回原对象 |

##### definition 导出仍然直接复用内部对象

| 位置 | 说明 |
| --- | --- |
| `src/unified-map/standard/overlay/popup.ts:126` | `options: this.options` |
| `src/unified-map/standard/overlay/dom.ts:60` | `options: this.options` |
| `src/unified-map/standard/overlay/polyline.ts:40` | `options: this.options` |
| `src/unified-map/standard/overlay/polygon.ts:35` | `options: this.options` |
| `src/unified-map/standard/overlay/circle.ts:60` | `options: this.options` |
| `src/unified-map/standard/overlay/marker.ts:130` | `options: this.options` |
| `src/unified-map/standard/control/navigation.ts:55` | `options: this.options` |
| `src/unified-map/standard/control/scale.ts:47` | `options: this.options` |
| `src/unified-map/standard/control/fullscreen.ts:83` | `options: this.options` |
| `src/unified-map/standard/control/geolocate.ts:86` | `options: this.options` |
| `src/unified-map/standard/control/attribution.ts:45` | `options: this.options` |
| `src/unified-map/pseudo/demo-models.ts:74` | source definition 也直接透传 `this.options` |

#### 判断

这部分和你给出的边界原则是直接冲突的，属于高优先级问题。

### 4.3 `core <-> adapter` 缺少完整类型，`unknown` 使用过多

#### 结论

项目在 `core` 与 `adapter` 的边界上选择了“全部先写成 `unknown`，再在实现里强转回来”的方式。这虽然避免了 `any`，但没有达到你要求的“完全信任，但要有完整类型”的目标。

也就是说，这里不是“运行时验证过多”，而是“静态建模不足”。

#### 影响

- IDE 补全和重构能力被削弱
- `core` 对 adapter 的契约无法在编译期表达
- 具体 adapter 实现依赖大量重复断言

#### 证据

| 位置 | 说明 |
| --- | --- |
| `src/unified-map/core/adapter.ts:40-141` | 几乎所有 map/source/layer/overlay/control handle 参数和返回值都是 `unknown` |
| `src/unified-map/core/map.ts:59` | `nativeMap?: unknown` |
| `src/unified-map/core/entity.ts:32` | `nativeHandle?: unknown` |
| `src/unified-map/core/entity.ts:71` | `getNativeHandle<THandle = unknown>()` 依赖调用方自己猜类型 |
| `src/unified-map/pseudo/pseudo-adapters.ts:334` | `mapHandle as PseudoNativeMap` |
| `src/unified-map/pseudo/pseudo-adapters.ts:344` | `mapHandle as PseudoNativeMap` |
| `src/unified-map/pseudo/pseudo-adapters.ts:359` | `(mapHandle as PseudoNativeMap).view` |
| `src/unified-map/pseudo/pseudo-adapters.ts:518` | geolocate 同样依赖 `mapHandle as PseudoNativeMap` |

#### 判断

这部分不算“偷懒到用 any”，但仍然属于类型过宽，且没有把关键边界真正类型化。

### 4.4 多处断言是在替代类型建模

#### 结论

当前代码有几处明显的“类型说不通，就先断言过去”的写法。这会让问题从“建模阶段暴露”变成“实现阶段隐藏”。

#### 影响

- 类型系统无法帮助发现真实不一致
- 后续接入真实 SDK 时，错误更可能在运行时出现

#### 证据

| 位置 | 说明 |
| --- | --- |
| `src/unified-map/pseudo/demo-models.ts:80` | `as unknown as SourceSpecification`，说明 demo source 类型与 MapLibre source 类型未真正对齐 |
| `src/unified-map/pseudo/demo-models.ts:123` | `filter: this.options.filter as never` |
| `src/unified-map/standard/overlay/base.ts:94` | `as unknown as OverlayDefinition<TOptions>` |
| `src/unified-map/standard/control/base.ts:104` | `as unknown as ControlDefinition<TOptions>` |
| `src/unified-map/standard/overlay/base.ts:63-70` | `fire(...) as never` 用来压制事件类型不匹配 |
| `src/unified-map/standard/control/base.ts:66-86` | control 事件发射同样依赖 `as never` |
| `src/unified-map/standard/overlay/anchored.ts:41-42` | `patchOptions` 和 `fire` 同时依赖断言 |
| `src/unified-map/standard/overlay/path.ts:27-28` | 同类问题重复出现 |

#### 判断

这部分属于“类型系统在场，但没有真正发挥作用”。

### 4.5 `standard` 和 `pseudo` 层存在过度封装与重复样板

#### 结论

部分抽象是有价值的，例如 `AbstractMap`、`AbstractMapAdapter`、`AbstractCapabilityProfile`。但叶子类里有不少封装只是为了维持类层次，而不是为了解决真实复用问题。

典型表现：

- 每个标准 overlay/control 子类都重复写一份几乎相同的 `toStandard*Definition()`
- `kind`、`meta`、`options: this.options` 的样板重复很多
- `pseudo/demo-models.ts` 中有多组空接口和极薄子类，仅仅是为了把名字改成 `Demo*`

#### 影响

- 增加文件数量和认知负担
- 真正的差异点被样板淹没
- 维护时更容易出现“小改动需要同步很多文件”的问题

#### 证据

##### 重复的 definition 组装样板

| 位置 | 说明 |
| --- | --- |
| `src/unified-map/standard/overlay/popup.ts:120` | popup 重复组装标准 definition |
| `src/unified-map/standard/overlay/dom.ts:54` | dom overlay 重复组装标准 definition |
| `src/unified-map/standard/overlay/polyline.ts:34` | polyline 重复组装标准 definition |
| `src/unified-map/standard/overlay/polygon.ts:29` | polygon 重复组装标准 definition |
| `src/unified-map/standard/overlay/circle.ts:54` | circle 重复组装标准 definition |
| `src/unified-map/standard/overlay/marker.ts:124` | marker 重复组装标准 definition |
| `src/unified-map/standard/control/navigation.ts:49` | navigation 重复组装标准 definition |
| `src/unified-map/standard/control/scale.ts:41` | scale 重复组装标准 definition |
| `src/unified-map/standard/control/fullscreen.ts:77` | fullscreen 重复组装标准 definition |
| `src/unified-map/standard/control/geolocate.ts:80` | geolocate 重复组装标准 definition |
| `src/unified-map/standard/control/attribution.ts:39` | attribution 重复组装标准 definition |

##### 只有命名作用、几乎没有语义增量的薄包装

| 位置 | 说明 |
| --- | --- |
| `src/unified-map/pseudo/demo-models.ts:147` | `DemoPopupOverlayOptions extends PopupOverlayOptions {}`，空接口 |
| `src/unified-map/pseudo/demo-models.ts:159` | `DemoNavigationControlOptions extends NavigationControlOptions {}`，空接口 |
| `src/unified-map/pseudo/demo-models.ts:174` | `DemoFullscreenControlOptions extends FullscreenControlOptions {}`，空接口 |
| `src/unified-map/pseudo/demo-models.ts:188` | `DemoGeolocateControlOptions extends GeolocateControlOptions {}`，空接口 |
| `src/unified-map/pseudo/demo-models.ts:204-207` | `DemoMap` 只是透传 `super`，没有新增语义 |

#### 判断

这部分符合你定义的“过度封装”：即便内联后也不会变长，而且几乎不形成真实复用。

### 4.6 同类概念的抽象深度不一致，有补丁感

#### 结论

`layer`、`overlay`、`control` 这三类对象在架构上的处理深度不一致：

- `layer` 的通用行为主要在 `core/layer.ts`
- `overlay` 和 `control` 的通用行为则主要放在 `standard/*/base.ts`
- 导致“同样是 map entity”，却需要记两套不同的抽象落点

这会给阅读者一种“先做了一套，再补了一层”的感觉。

#### 影响

- 心智模型不统一
- 新增对象类型时，不容易判断逻辑应该放在 `core/` 还是 `standard/`

#### 证据

| 位置 | 说明 |
| --- | --- |
| `src/unified-map/core/layer.ts:36-73` | layer 的可见性、zIndex、事件等通用行为都在 core |
| `src/unified-map/core/overlay.ts:15-24` | overlay 在 core 只是薄壳 |
| `src/unified-map/core/control.ts:22-45` | control 在 core 也是薄壳 |
| `src/unified-map/standard/overlay/base.ts:19-95` | overlay 的核心通用行为被挪到 standard |
| `src/unified-map/standard/control/base.ts:26-105` | control 的核心通用行为也被挪到 standard |

#### 判断

这部分不一定会立刻造成 bug，但会显著增加维护成本，属于明确的架构一致性问题。

## 5. 额外观察

### 5.1 正向部分

以下方面是做得比较好的：

- `Map -> Adapter -> Capability` 主链条清楚
- `internal-lifecycle.ts` 和 `internal-events.ts` 尝试把内部权限收口
- `Source` 的刷新合并用 `queueMicrotask()` 处理，方向是对的
- `strict: true` 已启用，说明项目并非完全放弃类型质量

### 5.2 当前缺少测试

项目当前没有发现测试文件。这意味着以下高风险行为没有自动化保护：

- `mount()` 中途失败时的状态一致性
- 外部对象引用被篡改后是否会静默破坏内部状态
- capability assert 与实体更新之间的时序
- popup/fullscreen/geolocate 这类状态型对象的事件回灌是否稳定

## 6. 优先级建议

如果要按收益排序，建议优先处理下面三件事：

1. 修复对象边界
   - 用户传入对象进入 core 时做重组
   - core 对外返回对象时做副本输出
   - definition 导出不要直接复用内部 `options`

2. 修复 `mount()` 失败回滚
   - `createMap()` 成功后，任一实体 materialize 失败都应逆序清理
   - 保证 `nativeMap`、注册表、挂载状态始终一致

3. 把 `core <-> adapter` 改成强类型句柄
   - 不做运行时校验，但要让句柄类型在编译期完整表达
   - 消除 `unknown` 和实现层反复强转

## 7. 最终结论

这个项目不是“乱写”，主抽象方向是对的；但它目前也还没有达到“优雅且稳固”的程度。

最核心的问题不是代码风格，而是下面三点：

- 生命周期失败路径不完整
- 对象边界不安全
- 类型系统没有真正打通 `core <-> adapter`

在这三个问题解决之前，这套抽象更像“可运行的设计骨架”，还不适合作为稳定 API 基础层继续外扩。

## 8. 我对以上问题的判断

这一节不是重复原文，而是明确给出我的立场：

- 哪些问题我认为必须改
- 哪些问题我同意方向，但会降低优先级
- 哪些问题我不建议为了“架构对称”而重构

### 8.2 关于对象边界不安全

#### 我的判断

必须改，但我不建议用“所有地方无脑深拷贝”这种粗暴方式改。

#### 为什么我认为这条能说服你

这一条和你的边界原则是正面冲突的，而且冲突得很具体：

- 用户把对象传进来，core 直接留引用
- core 再把内部对象直接从 getter / snapshot / definition 里吐出去
- 调用方于是可以绕过 `patchOptions()` 和事件系统，偷偷改内部状态

这里最大的问题不是“可变对象不好”，而是“可变对象失控”。

一旦外部拿到 `options`、`coordinate`、`coordinates`、`initialView` 的真实引用，core 就失去了状态入口的唯一性。后面你再精心设计事件、生命周期、adapter 更新时机，都会被这条后门绕开。

但我也不建议把所有对象都做一次通用 `deepClone()`。原因也很现实：

- 这里有 `HTMLElement`、`Node`、函数等不可 JSON 化对象
- 盲目深拷贝会把性能和语义一起搞坏
- 真正需要的是“入口归一化，出口副本化”，不是“所有字段机械深拷贝”

#### 简单修改示例

修改意图只有一句话：外部对象进入 core 时重组一次，对外返回时给副本，不暴露内部引用。

```ts
protected constructor(id: string, initialOptions: TOptions) {
  super();
  this.id = id;
  this.optionsValue = cloneOptions(initialOptions);
}

public get options(): Readonly<TOptions> {
  return cloneOptions(this.optionsValue);
}

protected snapshot(): MapEntitySnapshot<TOptions> {
  return {
    id: this.id,
    state: this.stateValue,
    options: cloneOptions(this.optionsValue),
  };
}
```

`cloneOptions()` 不要做成一个万能深拷贝黑箱，而应该按领域写清楚：

```ts
function cloneCameraState(view: CameraState): CameraState {
  return {
    ...view,
    center: Array.isArray(view.center)
      ? [...view.center] as const
      : { ...view.center },
    padding: view.padding ? { ...view.padding } : undefined,
    bounds: view.bounds
      ? {
          southwest: { ...view.bounds.southwest },
          northeast: { ...view.bounds.northeast },
        }
      : undefined,
  };
}
```

如果你问我该怎么排优先级，我会先保护下面这些出口：

- `AbstractMapEntity.options`
- `snapshot()`
- `AbstractMap.getView()`
- `coordinate` / `coordinates` 这类直接暴露可变结构的 getter
- `to*Definition()` 里直接返回 `options: this.options` 的位置

### 8.4 关于“断言在替代建模”

#### 我的判断

这条我只同意一半。

我会把这里分成两类：

- 应该改：跨外部库边界的断言
- 可以暂留：为了压过 TypeScript 推断局限而写的局部断言

#### 为什么我认为这条能说服你

不是所有断言都一样危险。

真正危险的是这种：

- `as unknown as SourceSpecification`
- `filter as never`

因为这等于在说：“我没有把本地类型和 MapLibre 类型真的对齐，但我先宣称它们对齐了。”

这会把不一致从编译期藏到运行期，尤其是在你把 demo model 接上真实渲染引擎时。

但像 `this.fire(... as never)` 这种写法，我不会把它和上面两类问题放在同一严重度。它更像是在绕过 TypeScript 对泛型事件映射的表达能力不足。它不好看，也不理想，但它未必意味着运行时契约已经失真。

也就是说，这条问题存在，但应该精准打击，而不是“一看见断言就全部判死刑”。

#### 简单修改示例

我会优先把“外部库边界上的断言”清掉，而不是先去大修事件系统。

```ts
import type {
  FilterSpecification,
  GeoJSONSourceSpecification,
} from "maplibre-gl";
import type { FeatureCollection } from "geojson";

export interface DemoGeoJsonSourceOptions {
  data: FeatureCollection;
  cluster?: boolean;
  tolerance?: number;
}

export interface DemoLineLayerOptions extends DataLayerOptions<DemoLinePaint> {
  sourceId: string;
  filter?: FilterSpecification;
}

const mapLibreSource: GeoJSONSourceSpecification = {
  type: "geojson",
  data: this.options.data,
  cluster: this.options.cluster,
  tolerance: this.options.tolerance,
};
```

如果你现在就让我取舍，我会这样排：

1. 先清理 `maplibre-gl` 边界上的断言
2. 再考虑是否要重做事件类型，让 `as never` 消失

### 8.5 关于 `standard` / `pseudo` 的重复样板和薄封装

#### 我的判断

我部分同意，但会明显降低严重度。

我不建议为了减少几段重复代码，就把这些具名类大面积折叠掉。

#### 为什么我认为这条能说服你

这里要分清两种东西：

- 真正没增量的包装
- 作为公共 API 名词存在的包装

比如这些空接口：

- `DemoPopupOverlayOptions extends PopupOverlayOptions {}`
- `DemoNavigationControlOptions extends NavigationControlOptions {}`

它们的确几乎没有价值，完全可以收掉。

但 `AbstractNavigationControl`、`AbstractMarkerOverlay`、`AbstractPopupOverlay` 这类具名类，我不建议因为“代码行数看起来重复”就删。原因很现实：

- 它们是用户理解 API 的入口名词
- 它们承担默认值策略
- 它们是未来追加专属行为的稳定落点

把这些类折叠回一个大而泛的基类，未必更优雅，常见结果反而是“行数变少了，但语义也变薄了”。

所以我会改“空包装”，保留“有语义的具名包装”。

#### 简单修改示例

我会先把真空壳收掉，再把 definition 组装样板往基类里收一层。

```ts
export type DemoPopupOverlayOptions = PopupOverlayOptions;
export type DemoNavigationControlOptions = NavigationControlOptions;
export type DemoFullscreenControlOptions = FullscreenControlOptions;
export type DemoGeolocateControlOptions = GeolocateControlOptions;
```

再把重复组装逻辑收敛成一个基类 helper：

```ts
protected buildStandardControlDefinitionBase() {
  return {
    id: this.id,
    position: this.position,
    visible: this.visible,
    metadata: this.options.metadata,
  };
}
```

叶子类就只保留真正的差异：

```ts
public toStandardControlDefinition(): NavigationControlDefinition {
  return {
    ...this.buildStandardControlDefinitionBase(),
    kind: this.kind,
    options: cloneNavigationOptions(this.options),
  };
}
```

这个改法的重点不是“把所有重复消灭”，而是“只消灭没有语义价值的重复”。

### 8.6 关于 `layer / overlay / control` 抽象深度不一致

#### 我的判断

我不建议为了对称性去大改这块架构。这一条更像设计选择，不像缺陷。

#### 为什么我认为这条能说服你

表面上看，它们确实不是一套深度：

- `layer` 的通用能力主要在 `core`
- `overlay` / `control` 的丰富能力主要在 `standard`

但这不一定说明“补丁感重”，也可能说明“抽象粒度按领域事实分布”。

`layer` 更接近地图引擎的原生概念，天然更适合放在 core：

- 它直接依赖 source
- 它和 style graph 的关系更稳定
- 不同引擎之间的共同语义更强

而 `overlay`、`control` 更像“标准化用户对象”，它们的行为、默认值、交互能力，本来就比 core 的最小生命周期契约更主观、更产品化。把丰富行为放在 `standard`，并不违和。

如果为了形式对称，强行把 overlay/control 的高层行为下沉到 `core`，大概率会发生两件事：

- core 变胖，开始承载并不真正通用的语义
- adapter 契约被迫跟着膨胀

这不是优化，而是把“层次不对称”误治成“职责不清”。

我认为这里真正该修的不是类层次，而是可读性。换句话说，这里更适合补文档和模块说明，而不是搬家。

#### 如果一定要动，我只会这样动

我不会迁移类层次，只会把意图写明：

```ts
// core/overlay.ts
// 这里只定义生命周期和 adapter 契约。
// 面向业务的标准 overlay 行为放在 standard/overlay/*。
```

```ts
// core/control.ts
// core 保持最小抽象；具名控件的默认行为和标准定义导出放在 standard/control/*。
```

这类改动虽然小，但比“为了对称而重构”更能长期降低理解成本。

### 8.7 关于 `PolylineOverlayOptions.curve`

#### 我的判断

这个我同意应该改，`curve` 更像 `style`，不该单独挂在顶层 options。

#### 为什么我认为这条能说服你

看现有模型，`PolylineOverlayOptions` 顶层主要承载的是对象级状态：

- `coordinates`
- 继承来的 `visible` / `zIndex` / `metadata`

而 `style` 里放的是“这条线怎么画”：

- `color`
- `width`
- `opacity`
- `dashArray`
- `lineCap`
- `lineJoin`

`curve` 的语义如果只是“折线按曲线方式渲染”，那它显然属于后一类，也就是表现层，而不是对象身份层。

把它放在顶层会带来两个问题：

- API 读起来不一致，调用者要记住“只有 curve 这个视觉属性被单独拎出来了”
- 后续如果再加 `smoothing`、`tension`、`geodesic` 之类能力，模型会继续散开

换句话说，问题不在于“顶层不能有这个字段”，而在于“这个字段和它的同类不在一起”。

#### 简单修改示例

修改意图只有一句话：把 `curve` 并回 `PolylineStyle`，让线的表现参数集中在一个入口里。

```ts
export interface PolylineStyle {
  color?: string;
  width?: number;
  opacity?: number;
  dashArray?: readonly number[];
  lineCap?: "butt" | "round" | "square";
  lineJoin?: "miter" | "round" | "bevel";
  curve?: boolean;
}

export interface PolylineOverlayOptions extends PathOverlayOptions {
  style?: PolylineStyle;
}
```

对应方法也从“改单个顶层字段”变成“改 style 的一个分量”：

```ts
public setCurve(curve: boolean): this {
  return this.setStyle({ curve });
}
```

如果你希望表达得更彻底一点，甚至可以直接不暴露 `setCurve()`，只保留：

```ts
polyline.setStyle({ curve: true });
```

这样调用面会更统一，调用者一眼就知道：这是线样式，不是线对象本体。

## 9. 我会怎么重排优先级

如果按“收益 / 风险比”来排，我会这样改：

1. `mount()` 失败回滚
2. 对象边界隔离
3. `core <-> adapter` 句柄强类型化
4. 清理外部库边界上的断言
5. 把 `polyline.curve` 并回 `style`
6. 收掉真正没有语义价值的薄包装
7. 给 `core` 和 `standard` 的分层意图补说明，而不是追求抽象对称

## 10. 最后一句话

原文指出的问题里，真正值得立刻动手的，是“状态一致性”和“对象边界”。

至于“重复样板”和“抽象深度不一致”，我认为要更克制：该收的收，但不要为了代码看起来更整齐，就把原本有语义价值的 API 入口也一起抹平。
