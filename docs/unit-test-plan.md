# 单元测试方案

本文档面向当前这个“统一地图抽象层”库项目，目标不是验证真实地图 SDK 的渲染结果，而是验证 `src/` 里的核心契约是否稳定：生命周期、事件、能力约束、状态同步、以及适配器桥接行为。

`dev/pseudo/` 里的伪实现会作为测试设计参考，也是很合适的 deterministic fake adapter 来源，但测试主语仍然是 `src/` 的公共行为，不是 demo 本身。

默认分层约定也要提前定清楚：

- `unit/core` 优先使用最小本地测试实体和最小测试 map / adapter
- `unit/standard` 只在确实需要 runtime bridge 回灌时复用 pseudo adapter
- `contract` 再去复用 `dev/pseudo/` 的跨引擎联动能力

## 1. 先定测试边界

这类库项目，测试设计和业务应用不一样。重点不应放在“页面渲染出来没”，而应放在“抽象契约有没有被破坏”。

当前项目最值得测的不是：

- 每个 getter / setter 都机械覆盖一遍
- 真实 MapLibre / BMapGL 是否画出了地图
- 整段 operation log 做大而脆的 snapshot

当前项目最值得测的是：

- `AbstractMap` 对实体注册、挂载、卸载、销毁的调度是否正确
- `AbstractMapEntity` 和 `internal-lifecycle` 是否正确限制了非法状态迁移
- `TypedEvented` / bridge / adapter 回灌事件是否符合契约
- capability 推导和断言是否在关键时机生效
- `standard/*` 里的状态型对象是否正确区分 requested state 和 actual state
- source 刷新合并、逆序卸载、错误转事件这类“容易回归但不易肉眼发现”的逻辑

结论：这应该是一个“契约测试 + 状态机测试 + 少量伪适配器集成测试”的方案，而不是 UI snapshot 方案。

## 2. 最佳实践

### 2.1 测行为，不测实现细节

测试应尽量围绕公共 API 和外部可观察结果：

- 状态值是否变化
- 事件是否派发
- 适配器方法是否被调用
- 错误是否被阻止或转成 `error` 事件

不要去断言私有字段、内部 `Map`/`Set` 的具体结构，除非没有别的观察面。

### 2.2 用 fake adapter，不碰真实地图 SDK

真实 SDK 会带来：

- 环境依赖重
- 非确定性事件
- DOM / WebGL / 网络耦合
- 调试成本高

当前仓库已经有 `dev/pseudo/pseudo-adapters.ts`，这很适合拿来做契约测试桩。它能稳定记录：

- mount / update / unmount 调用顺序
- capability 差异
- popup / fullscreen / geolocate 等运行时事件桥接

这比引入真实 MapLibre / BMapGL 做单元测试更合理。

但也要控制边界：

- 不要把 demo source / layer / overlay 默认当成 core 单测夹具
- 对错误路径，优先提供可故障注入的最小测试 adapter，而不是等待 pseudo adapter“自然抛错”

### 2.3 默认用 Node 环境，只给少量 DOM 用例开浏览器模拟

大部分逻辑都是纯 TypeScript，不依赖 DOM。默认测试环境应保持 `node`：

- 启动快
- 更稳定
- 更容易定位逻辑问题

只有当测试必须构造 `HTMLElement` / `Node` 时，再对个别测试文件切到 `happy-dom`。

### 2.4 表驱动测试 capability 和跨引擎契约

当前项目天然适合 `describe.each(...)`：

- 同一个 overlay / control，在不同 adapter 下 capability 是否一致
- MapLibre pseudo adapter 和 BMapGL pseudo adapter，在相同行为下哪些结果应相同，哪些应不同

这比复制两套几乎相同的测试更稳。

### 2.5 专门覆盖异步边界

当前代码里已经有一个非常典型的异步边界：

- `AbstractMap.bindSource()` 里用 `queueMicrotask()` 合并 source 刷新

这类逻辑必须单独测，不能只靠普通同步用例顺带覆盖。

### 2.6 少用 snapshot

本项目不适合大量 snapshot。

可以接受的 snapshot 场景：

- 很小、很稳定的 definition 对象

不建议 snapshot 的场景：

- 整段 adapter operation log
- 整个事件对象序列
- 大型 definition/export 对象

更稳的做法是断言关键行为和关键字段。

## 3. 工具选型

我建议直接用 `Vitest`，理由很明确：

- 当前项目本身就是 `Vite + TypeScript`
- alias 和 ESM 适配成本最低
- 运行速度快
- mock / spy / fake timer 能力够用

建议的测试栈：

- `vitest`
- `@vitest/coverage-v8`
- `happy-dom`，只在少量 DOM 用例中按文件启用

建议脚本：

- `test`: `vitest run`
- `test:watch`: `vitest`
- `test:coverage`: `vitest run --coverage`

## 4. 目录结构

建议新测试目录如下：

```text
test/
  fixtures/
    core.ts
    faulty-adapter.ts
    pseudo.ts
    flush.ts
  unit/
    core/
      events.test.ts
      capability.test.ts
      internal-lifecycle.test.ts
      entity.test.ts
      map.lifecycle.test.ts
      map.registry.test.ts
      map.state-sync.test.ts
      map.source-refresh.test.ts
      map.error-handling.test.ts
    standard/
      overlay.marker.test.ts
      overlay.popup.test.ts
      overlay.path.test.ts
      overlay.circle.test.ts
      overlay.dom.test.ts
      control.fullscreen.test.ts
      control.geolocate.test.ts
      control.base.test.ts
      common.geometry.test.ts
  contract/
    pseudo-adapter.contract.test.ts
```

约束如下：

- `unit/core` 只测核心抽象层契约
- `unit/standard` 只测标准对象上的业务语义
- `contract` 只测“同一公共 API 在不同 pseudo adapter 下的契约”
- `fixtures` 放最薄的一层测试夹具，不把 demo 脚本本身直接当测试框架

## 5. 具体测试分层

## 5.1 P0：核心契约测试

这部分优先级最高，应该先做。

### `src/core/events.ts`

要测的点：

- `on` / `off` / `once` / `listens` 的基本行为
- `once(type)` Promise 形式是否只 resolve 一次
- 持久监听与一次性监听是否都能收到事件
- `off` 是否能同时移除持久和一次性监听
- `fire()` 事件对象是否包含 `type`、`target` 和 payload

这部分价值高，因为整个库的事件模型都建立在这里。

### `src/core/capability.ts`

要测的点：

- `getOverlayRequiredCapabilities()` 的推导是否正确
- `getControlRequiredCapabilities()` 的推导是否正确
- `StaticCapabilityProfile.supports()` 的 level 比较是否正确
- `assert()` 是否在不足能力时抛出包含 fallback 的错误

建议用表驱动按 kind 分支全覆盖：

- overlay：`marker / popup / dom / polyline / polygon / circle`
- control：`navigation / scale / fullscreen / geolocate / attribution / custom`

重点断言“required capability 集合是否正确”，而不是只测几个热门对象。

### `src/core/internal-lifecycle.ts`

要测的点：

- disposed entity 不允许重新 bind
- 同一实体不允许被不同 map 管理
- mounted entity 不允许直接 release
- `mountManagedEntity()` / `unmountManagedEntity()` 是否走受控入口

这部分是整个 map-entity 生命周期约束的护栏，必须单测。

### `src/core/entity.ts`

要测的点：

- 初始状态为 `draft`
- `setOptions()` / `touch()` 会派发 `updated`
- `attach()` / `detach()` 会改变状态并派发生命周期事件
- 非法 lifecycle access 会抛错
- managed 状态下不允许 `dispose()`
- disposed 后禁止继续修改

### `src/core/map.ts`

这是单元测试的主战场。

要按行为分成几个测试文件：

#### `map.lifecycle.test.ts`

覆盖：

- `load()` 幂等
- 并发 `load()` 只调用一次 adapter `load()`
- `load()` 失败后可重试
- 未 `load()` 时 `mount()` 不生效
- 无 target 时 `mount()` 不生效
- `mount()` 后派发 `mounted`
- `unmount()` 后派发 `unmounted`
- `destroy()` 后派发 `destroyed`
- destroyed 后多数写操作只告警并短路

#### `map.registry.test.ts`

覆盖：

- source / layer / overlay / control 的 add/get/remove
- duplicate id 抛错
- layer 引用不存在的 source 抛错
- remove source 时依赖 layer 存在且未 `cascade` 会抛错
- `cascade: true` 时会先删 layer 再删 source
- 先 add 后 mount 时，mount 会补齐 materialize
- 已 mount 时 add，会立即 materialize

#### `map.source-refresh.test.ts`

覆盖：

- source 的 `updated` 和 `dataChanged` 同一事件循环内只触发一次 adapter `updateSource`
- source 已 unmount 或 map 已 unmount 时不会误刷新

这里需要一个 `flushMicrotasks()` helper。

#### `map.state-sync.test.ts`

覆盖：

- `setView()` 已挂载时是否正确委托给 adapter；未挂载时是否按前置条件报错
- `getView()` 已挂载时是否走 adapter；未挂载时是否返回约定的内存态 / 初始视图
- `patchMapOptions()` 未挂载时是否先更新内存态，挂载时是否进入 `createMap()`
- `setStyle()` 是否只是 `patchMapOptions({ style })` 的语义化入口
- `project()` / `unproject()` 未挂载时的前置条件，以及已挂载时是否正确委托

#### `map.error-handling.test.ts`

覆盖：

- `createMap()` 失败时是否转成 map `error` 事件
- mount source/layer/overlay/control 时 adapter 抛错会转成 map `error` 事件
- unmount / destroy 批量流程中 adapter 抛错会转成 `error` 事件而不是直接炸掉流程
- `entityKind` / `entityId` / `operation` 字段是否正确

实现建议：

- 使用 `test/fixtures/faulty-adapter.ts` 提供最小故障注入 adapter
- 显式控制 `createMap / mountXxx / unmountXxx / destroyMap` 在指定步骤抛错
- 不依赖 pseudo adapter 的自然行为去“碰运气”覆盖失败分支

#### 逆序卸载

建议在 lifecycle 或 registry 测试中专门断言：

- `unmount()` 顺序是 control -> overlay -> layer -> source
- `destroy()` 释放托管关系也按逆序

这类顺序错误在库项目里很常见，而且回归代价高。

## 5.2 P1：标准对象行为测试

这部分测的是 `src/standard/` 里的“业务语义”，不是 adapter。

### `overlay.popup.test.ts`

覆盖：

- `requestedOpen` 与 `actualOpen` 的区分
- `open()` / `close()` / `toggle()` 的 options 变化
- pseudo adapter 触发 `opened` / `closed` 后 `actualOpen` 是否同步
- `unmounted` 后 `actualOpen` 是否回到 `false`
- open 状态是否要求 `overlay.popup.open` capability

### `overlay.marker.test.ts`

覆盖：

- `setDraggable(true)` 是否要求 `overlay.marker.drag`
- `bindPopup()` 是否要求 `overlay.marker.bindPopup`
- 已分属不同 map 的 marker/popup 不允许绑定
- `bindPopup()` 切换 popup 时会关闭旧 popup
- `openPopup()` / `closePopup()` / `togglePopup()` 是否委托给 popup

### `control.fullscreen.test.ts`

覆盖：

- `active` 与 `actualActive` 的区分
- `enter()` / `exit()` / `toggle()` 的 options 变化
- pseudo adapter 触发 `entered` / `exited` 后 `actualActive` 是否同步
- active 状态是否要求 `control.fullscreen.active`

### `control.geolocate.test.ts`

覆盖：

- `setTracking(true)` 是否要求 `control.geolocate.tracking`
- `locateOnce()` 是否递增 `locateRequestVersion`
- pseudo adapter 在 `timeout=0` 时是否回灌 `error`
- `tracking` 或 `locateOnce()` 是否触发 `geolocate`

### `overlay.path.test.ts`

覆盖：

- `appendCoordinate` / `prependCoordinate` / `insertCoordinate` / `replaceCoordinate` / `removeCoordinate`
- 越界时抛 `RangeError`

### `overlay.circle.test.ts`

覆盖：

- `setRadius()` 对负数和非有限值的保护

### `overlay.dom.test.ts`

覆盖：

- `addClassName()` / `removeClassName()` 的字符串处理
- `setInteractive()` / `setRotation()` / `setContent()` 的 patch 行为

### `control.base.test.ts`

覆盖：

- 默认 position 是否符合各控件预期
- `setOffset()` 是否会做 offset 标准化和去重
- `show()` / `hide()` / `toggleVisibility()` 的语义

## 5.3 P2：pseudo adapter 契约测试

这部分不是为了重复测一遍 core，而是验证“公共 API + fake adapter”这一层的真实联动。

建议做一个 `describe.each([PseudoMapLibreAdapter, PseudoBMapGLAdapter])` 的契约测试，覆盖：

- 相同地图操作下，两者都能完成 load / mount / destroy 基本闭环
- popup / fullscreen / geolocate 的 adapter 事件桥接可工作
- capability 差异在预期位置体现出来
- `project()` / `unproject()` 的互逆关系成立

注意：

- 这里只断言契约，不去锁死每一行 operation log 文本
- 可以断言“包含关键动作”和“调用顺序片段”

## 6. 这次不做的测试

为避免测试膨胀，以下内容不作为第一阶段目标：

- 真实 MapLibre / BMapGL SDK 集成测试
- 浏览器端 DOM 渲染截图测试
- 对所有 `toDefinition()` 结果做大而全的 snapshot
- 对每一个 trivial setter 单独写一条重复性很高的测试

原则是：优先覆盖状态机、约束和桥接行为，而不是追求“方法数量覆盖率”。

## 7. 基础设施实现计划

### Phase 1：测试框架落地

新增：

- `vitest` 相关依赖
- `test` / `test:watch` / `test:coverage` 脚本
- alias 与测试环境配置
- `test/fixtures/core.ts`
- `test/fixtures/faulty-adapter.ts`
- `test/fixtures/flush.ts`
- `test/fixtures/pseudo.ts`

这里的夹具建议分成两层：

- `core.ts`
  - 提供最小 `TestMap`
  - 提供最小 source / layer / overlay / control 测试实体
  - 默认服务 `unit/core`
- `faulty-adapter.ts`
  - 提供可注入故障的最小 adapter
  - 专门服务 `map.error-handling.test.ts`
- `pseudo.ts`
  - 复用 pseudo adapter 和必要的 demo shell
  - 服务 `unit/standard` 里需要 runtime bridge 的用例，以及 `contract`

其中 `pseudo.ts` 建议做一层薄封装：

- 统一创建 map shell
- 只提供少量需要 pseudo runtime 的默认对象
- 提供 `createMapWithAdapter()`、`mountLoadedMap()` 之类 helper

不要在测试里直接复制 `dev/pseudo/demo.ts` 的整段场景，也不要让 demo 数据模型变成 core 单测的默认依赖。

### Phase 2：先拿下 P0

先做 `core` 契约测试，因为这里最能防回归，也最不依赖后续细节。

交付标准：

- `events`
- `capability`
- `internal-lifecycle`
- `entity`
- `map` 的 lifecycle / registry / state-sync / source-refresh / error-handling

### Phase 3：补 P1

把标准对象的高价值语义补齐：

- popup
- marker
- fullscreen
- geolocate
- path
- circle
- dom
- control base

### Phase 4：做 P2 契约回归

最后补跨 adapter 的契约回归，确保以后替换或新增 adapter 时有一个稳定参照。

## 8. 覆盖率策略

我不建议一开始就用全局高阈值卡死 CI，否则第一轮落地成本会被配置问题放大。

建议分两步：

### 第一阶段

- 先生成 coverage 报告，不设强制阈值
- 用报告确认盲区是否集中在 `core/map.ts`、`entity.ts`、`standard/*`

### 第二阶段

在主干测试稳定后再加阈值：

- `src/core/**`：
  - statements >= 90
  - lines >= 90
  - branches >= 85
- 全局：
  - statements >= 80
  - lines >= 80
  - branches >= 70

原因很简单：这个项目真正高价值的是 core，不是全局平均值。

## 9. 我决定怎么做

最终方案如下：

1. 采用 `Vitest` 作为唯一单元测试框架。
2. 以 `src/core` 为第一优先级，以 `src/standard` 的状态型对象为第二优先级。
3. 以 `dev/pseudo` 的 adapter 和 demo model 作为测试夹具参考，优先让 `core` 用最小本地实体，不直接把 demo 脚本当成测试。
4. 默认跑 `node` 环境，只在极少数 DOM 相关测试里启用 `happy-dom`。
5. 测试主线围绕“生命周期、事件、能力、状态同步、错误处理、异步合并”这六类风险展开。
6. 不做真实 SDK 集成测试，不做重 snapshot，不做低价值 setter 铺量。
7. bridge 不单列成新的高优先级测试文件，而是通过 `viewChanged`、popup/fullscreen/geolocate 回灌、以及 contract 用例显式覆盖。
8. 先落地 P0，再补 P1/P2，最后再收紧 coverage 阈值。

## 10. 预期交付物

按这个方案推进，最终会新增的主要内容应包括：

- 测试依赖与脚本
- `test/fixtures/*`
- `test/unit/core/*`
- `test/unit/standard/*`
- `test/contract/pseudo-adapter.contract.test.ts`

如果下一步开始实施，我会先把测试基础设施搭起来，然后优先写 `core` 的第一批测试，因为这是这个仓库最值钱、也是最容易在后续演进中被改坏的部分。
