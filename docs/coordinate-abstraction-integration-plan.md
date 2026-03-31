## 需求判断
- 合理性：合理。你要求的三件事（geo 工具、Turf 运行时依赖、Overlay 计算辅助方法）都与当前统一地图抽象层职责一致，且能独立落地，不需要牵动 Adapter/Map 坐标语义改造。
- 代码理解判断：基本准确，但有一个边界差异：当前仓库只有通用 `AbstractOverlay`，没有现成的 Polyline/Polygon 专用抽象类，因此“给部分 overlay 增加方法”应通过轻量重构新增专用抽象层，而不是直接塞进所有 overlay。
- 关键依据：
  - `src/unified-map/core/overlay.ts` 目前仅有通用 `AbstractOverlay`（L1-L23），没有路径/面几何专用扩展点。
  - `src/unified-map/core/types.ts` 里 `OverlayKind` 已有 `polyline` 与 `polygon`（L117-L125），说明语义已存在但实现层缺位。
  - `src/unified-map/index.ts` 目前未导出 `geo`（L1-L14），无法对外暴露统一空间工具。
  - `package.json` 已在 `dependencies` 中安装 `@turf/turf`（L11-L13），满足“打包进去”的依赖层要求。

## 目标
- 对外目标：
  - 对外暴露 `geo/coordinate` 与 `geo/transformer`。
  - 为 Polyline/Polygon 这类几何 Overlay 提供内聚的测量/插值辅助方法，并支持 `unit` 参数。
- 内部架构目标：
  - 将空间算法集中在 `geo`，避免在 Overlay 类里复制计算逻辑。
  - Overlay 方法层只做编排与输入约束，不重复实现数学细节。
- 明确非目标（防止范围回涨）：
  - 不改 `Map`/`Adapter` 坐标语义。
  - 不改事件归一化。
  - 不引入公共 API 的坐标系断代改造。

## 可能的困难
- 当前无 Polyline/Polygon 抽象层：若直接把方法加到 `AbstractOverlay` 会污染所有 Overlay，造成职责泄漏。
- 线性与面积单位不是同一量纲：`distance` 与 `area` 需要不同单位枚举，避免把 `miles` 直接用于面积。
- 3D 距离依赖可选 `alt`：必须定义“缺省 alt = 0m”规则，保证计算稳定。
- Turf 与手写算法边界：`transformer`（WGS84/GCJ02/BD09）仍需手写或迁移现有实现，Turf 不覆盖中国偏移坐标互转。
- 仓库当前存在既有 TS 报错（`demo-models.ts`、`demo.ts`），与本需求无直接关系；本方案不把这些既有问题扩为本轮范围。

## 实现大纲
1. 建立 `geo` 基础模块
- 新增 `transformer.ts` 承载坐标系互转。
- 新增 `coordinate.ts` 承载距离/面积/插值与单位换算。
- 新增 `geo/index.ts` 做统一导出。

2. 通过轻量重构新增“部分 Overlay”能力
- 保持 `AbstractOverlay` 通用基类不变职责。
- 在同文件新增 `AbstractPolylineOverlay` 与 `AbstractPolygonOverlay`，把 `distance / distance3d / segmentDistances / interpolateByRatio / sliceByRatio / perimeter / area` 放到专用抽象层。

3. 暴露 API 与依赖收口
- `src/unified-map/index.ts` 导出 `geo`。
- `package.json` 维持 `@turf/turf` 在 `dependencies`，确保打包链路稳定。

## 具体实现
1. `[package.json]`
- 变更范围：`L11-L14`（`dependencies` 段）
- 修改内容：
```json
{
  "dependencies": {
    "@turf/turf": "^7.3.4",
    "maplibre-gl": "^5.21.0"
  }
}
```
- 设计说明：
  - 运行时依赖必须放 `dependencies`，这样 Vite 构建与产物运行都能直接解析。

2. `[src/unified-map/geo/transformer.ts]`
- 变更范围：`new file`
- 修改内容：
```ts
export interface TransformPoint {
  lng: number;
  lat: number;
  alt?: number;
}

const PI = Math.PI;
const A = 6378245.0;
const EE = 0.00669342162296594323;
const X_PI = (PI * 3000.0) / 180.0;

function outOfChina(lng: number, lat: number): boolean {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLat(lng: number, lat: number): number {
  let ret =
    -100.0 +
    2.0 * lng +
    3.0 * lat +
    0.2 * lat * lat +
    0.1 * lng * lat +
    0.2 * Math.sqrt(Math.abs(lng));
  ret +=
    ((20.0 * Math.sin(6.0 * lng * PI) + 20.0 * Math.sin(2.0 * lng * PI)) *
      2.0) /
    3.0;
  ret +=
    ((20.0 * Math.sin(lat * PI) + 40.0 * Math.sin((lat / 3.0) * PI)) * 2.0) /
    3.0;
  ret +=
    ((160.0 * Math.sin((lat / 12.0) * PI) +
      320 * Math.sin((lat * PI) / 30.0)) *
      2.0) /
    3.0;
  return ret;
}

function transformLng(lng: number, lat: number): number {
  let ret =
    300.0 +
    lng +
    2.0 * lat +
    0.1 * lng * lng +
    0.1 * lng * lat +
    0.1 * Math.sqrt(Math.abs(lng));
  ret +=
    ((20.0 * Math.sin(6.0 * lng * PI) + 20.0 * Math.sin(2.0 * lng * PI)) *
      2.0) /
    3.0;
  ret +=
    ((20.0 * Math.sin(lng * PI) + 40.0 * Math.sin((lng / 3.0) * PI)) * 2.0) /
    3.0;
  ret +=
    ((150.0 * Math.sin((lng / 12.0) * PI) +
      300.0 * Math.sin((lng / 30.0) * PI)) *
      2.0) /
    3.0;
  return ret;
}

function wgs84Delta(lng: number, lat: number): { dLng: number; dLat: number } {
  const dLat = transformLat(lng - 105.0, lat - 35.0);
  const dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);

  return {
    dLat: (dLat * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI),
    dLng: (dLng * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * PI),
  };
}

export function wgs84ToGcj02(point: TransformPoint): TransformPoint {
  if (outOfChina(point.lng, point.lat)) {
    return { ...point };
  }
  const { dLng, dLat } = wgs84Delta(point.lng, point.lat);
  return {
    lng: point.lng + dLng,
    lat: point.lat + dLat,
    alt: point.alt,
  };
}

export function gcj02ToWgs84(point: TransformPoint): TransformPoint {
  if (outOfChina(point.lng, point.lat)) {
    return { ...point };
  }
  const { dLng, dLat } = wgs84Delta(point.lng, point.lat);
  return {
    lng: point.lng - dLng,
    lat: point.lat - dLat,
    alt: point.alt,
  };
}

export function gcj02ToBd09(point: TransformPoint): TransformPoint {
  const z =
    Math.sqrt(point.lng * point.lng + point.lat * point.lat) +
    0.00002 * Math.sin(point.lat * X_PI);
  const theta = Math.atan2(point.lat, point.lng) + 0.000003 * Math.cos(point.lng * X_PI);

  return {
    lng: z * Math.cos(theta) + 0.0065,
    lat: z * Math.sin(theta) + 0.006,
    alt: point.alt,
  };
}

export function bd09ToGcj02(point: TransformPoint): TransformPoint {
  const x = point.lng - 0.0065;
  const y = point.lat - 0.006;
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * X_PI);
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * X_PI);

  return {
    lng: z * Math.cos(theta),
    lat: z * Math.sin(theta),
    alt: point.alt,
  };
}
```
- 设计说明：
  - 坐标转换放在 `geo`，不会污染 `core/map` 与 `adapter`。
  - 保留 `alt` 透传，确保 3D 计算输入链可用。

3. `[src/unified-map/geo/coordinate.ts]`
- 变更范围：`new file`
- 修改内容：
```ts
import { along, area as turfArea, length as turfLength, lineString, polygon } from "@turf/turf";
import {
  bd09ToGcj02,
  gcj02ToBd09,
  gcj02ToWgs84,
  wgs84ToGcj02,
  type TransformPoint,
} from "./transformer";

export type CoordinateType = "wgs84" | "gcj02" | "bd09";
export type DistanceUnit = "meters" | "kilometers" | "miles";
export type AreaUnit = "squareMeters" | "squareKilometers" | "squareMiles";

export type LngLatAltTuple = readonly [lng: number, lat: number, alt?: number];

export interface LngLatAltLiteral<T extends number = number> {
  lng: T;
  lat: T;
  alt?: T;
}

export type LngLatAltLike = LngLatAltTuple | LngLatAltLiteral<number>;

export interface CoordinateGroup<T extends number = number> {
  wgs84?: LngLatAltLiteral<T>;
  gcj02?: LngLatAltLiteral<T>;
  bd09?: LngLatAltLiteral<T>;
}

export function toLngLatAltLiteral(value: LngLatAltLike): LngLatAltLiteral<number> {
  if (Array.isArray(value)) {
    return value[2] === undefined
      ? { lng: value[0], lat: value[1] }
      : { lng: value[0], lat: value[1], alt: value[2] };
  }

  return value.alt === undefined
    ? { lng: value.lng, lat: value.lat }
    : { lng: value.lng, lat: value.lat, alt: value.alt };
}

function asTransformPoint(value: LngLatAltLike): TransformPoint {
  const literal = toLngLatAltLiteral(value);
  return literal.alt === undefined
    ? { lng: literal.lng, lat: literal.lat }
    : { lng: literal.lng, lat: literal.lat, alt: literal.alt };
}

function kmToDistanceUnit(kilometers: number, unit: DistanceUnit): number {
  switch (unit) {
    case "kilometers":
      return kilometers;
    case "meters":
      return kilometers * 1000;
    case "miles":
      return kilometers * 0.621371;
  }
}

function squareMetersToAreaUnit(squareMeters: number, unit: AreaUnit): number {
  switch (unit) {
    case "squareMeters":
      return squareMeters;
    case "squareKilometers":
      return squareMeters / 1_000_000;
    case "squareMiles":
      return squareMeters / 2_589_988.110336;
  }
}

function ensureRatio(ratio: number, name: string): void {
  if (ratio < 0 || ratio > 1) {
    throw new Error(`${name} must be within [0, 1].`);
  }
}

function ensurePath(points: ReadonlyArray<LngLatAltLike>): ReadonlyArray<LngLatAltLiteral<number>> {
  if (points.length < 2) {
    throw new Error("Polyline requires at least two coordinates.");
  }
  return points.map((point) => toLngLatAltLiteral(point));
}

function ensureRing(points: ReadonlyArray<LngLatAltLike>): ReadonlyArray<LngLatAltLiteral<number>> {
  if (points.length < 3) {
    throw new Error("Polygon ring requires at least three coordinates.");
  }
  return points.map((point) => toLngLatAltLiteral(point));
}

function closeRing(points: ReadonlyArray<LngLatAltLiteral<number>>): ReadonlyArray<LngLatAltLiteral<number>> {
  const first = points[0];
  const last = points[points.length - 1];
  if (first.lng === last.lng && first.lat === last.lat) {
    return points;
  }
  return [...points, first];
}

export class Coordinate {
  private readonly sourceType: CoordinateType;
  private readonly source: LngLatAltLiteral<number>;
  private readonly cache: Partial<Record<CoordinateType, LngLatAltLiteral<number>>> = {};

  public constructor(value: LngLatAltLike, type: CoordinateType = "wgs84") {
    this.sourceType = type;
    this.source = toLngLatAltLiteral(value);
    this.cache[type] = this.source;
  }

  public static from(value: LngLatAltLike, type: CoordinateType = "wgs84"): Coordinate {
    return new Coordinate(value, type);
  }

  public get wgs84(): LngLatAltLiteral<number> {
    return this.resolve("wgs84");
  }

  public get gcj02(): LngLatAltLiteral<number> {
    return this.resolve("gcj02");
  }

  public get bd09(): LngLatAltLiteral<number> {
    return this.resolve("bd09");
  }

  public toLiteral(type: CoordinateType): LngLatAltLiteral<number> {
    return this.resolve(type);
  }

  public toTuple(type: CoordinateType): LngLatAltTuple {
    const literal = this.resolve(type);
    return literal.alt === undefined
      ? [literal.lng, literal.lat]
      : [literal.lng, literal.lat, literal.alt];
  }

  private resolve(type: CoordinateType): LngLatAltLiteral<number> {
    const cached = this.cache[type];
    if (cached) {
      return cached;
    }

    const base = this.cache[this.sourceType] ?? this.source;

    let resolved: TransformPoint;
    if (this.sourceType === type) {
      resolved = asTransformPoint(base);
    } else if (this.sourceType === "wgs84" && type === "gcj02") {
      resolved = wgs84ToGcj02(asTransformPoint(base));
    } else if (this.sourceType === "wgs84" && type === "bd09") {
      resolved = gcj02ToBd09(wgs84ToGcj02(asTransformPoint(base)));
    } else if (this.sourceType === "gcj02" && type === "wgs84") {
      resolved = gcj02ToWgs84(asTransformPoint(base));
    } else if (this.sourceType === "gcj02" && type === "bd09") {
      resolved = gcj02ToBd09(asTransformPoint(base));
    } else if (this.sourceType === "bd09" && type === "gcj02") {
      resolved = bd09ToGcj02(asTransformPoint(base));
    } else {
      resolved = gcj02ToWgs84(bd09ToGcj02(asTransformPoint(base)));
    }

    const literal: LngLatAltLiteral<number> = resolved.alt === undefined
      ? { lng: resolved.lng, lat: resolved.lat }
      : { lng: resolved.lng, lat: resolved.lat, alt: resolved.alt };

    this.cache[type] = literal;
    return literal;
  }
}

export function haversine(
  lng1: number,
  lat1: number,
  lng2: number,
  lat2: number,
): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371 * c;
}

export function haversine3d(
  lng1: number,
  lat1: number,
  alt1Meters: number,
  lng2: number,
  lat2: number,
  alt2Meters: number,
): number {
  const planarKm = haversine(lng1, lat1, lng2, lat2);
  const dzKm = (alt2Meters - alt1Meters) / 1000;
  return Math.sqrt(planarKm * planarKm + dzKm * dzKm);
}

export function polylineDistance(
  points: ReadonlyArray<LngLatAltLike>,
  unit: DistanceUnit = "meters",
): number {
  const path = ensurePath(points);
  const km = turfLength(lineString(path.map((point) => [point.lng, point.lat])), { units: "kilometers" });
  return kmToDistanceUnit(km, unit);
}

export function polylineDistance3d(
  points: ReadonlyArray<LngLatAltLike>,
  unit: DistanceUnit = "meters",
): number {
  const path = ensurePath(points);
  let totalKm = 0;

  for (let i = 1; i < path.length; i += 1) {
    const prev = path[i - 1];
    const next = path[i];
    totalKm += haversine3d(
      prev.lng,
      prev.lat,
      prev.alt ?? 0,
      next.lng,
      next.lat,
      next.alt ?? 0,
    );
  }

  return kmToDistanceUnit(totalKm, unit);
}

export function polylineSegmentDistances(
  points: ReadonlyArray<LngLatAltLike>,
  unit: DistanceUnit = "meters",
): readonly number[] {
  const path = ensurePath(points);
  const segments: number[] = [];

  for (let i = 1; i < path.length; i += 1) {
    const prev = path[i - 1];
    const next = path[i];
    const km = haversine(prev.lng, prev.lat, next.lng, next.lat);
    segments.push(kmToDistanceUnit(km, unit));
  }

  return segments;
}

export function polylineInterpolateByRatio(
  points: ReadonlyArray<LngLatAltLike>,
  ratio: number,
): LngLatAltLiteral<number> {
  ensureRatio(ratio, "ratio");

  const path = ensurePath(points);
  if (ratio === 0) {
    return path[0];
  }
  if (ratio === 1) {
    return path[path.length - 1];
  }

  const line = lineString(path.map((point) => [point.lng, point.lat]));
  const totalKm = turfLength(line, { units: "kilometers" });
  const at = along(line, totalKm * ratio, { units: "kilometers" }).geometry.coordinates;

  return { lng: at[0], lat: at[1] };
}

export function polylineSliceByRatio(
  points: ReadonlyArray<LngLatAltLike>,
  startRatio: number,
  endRatio: number,
): readonly LngLatAltLiteral<number>[] {
  ensureRatio(startRatio, "startRatio");
  ensureRatio(endRatio, "endRatio");
  if (startRatio > endRatio) {
    throw new Error("startRatio must be <= endRatio.");
  }

  const path = ensurePath(points);
  const start = polylineInterpolateByRatio(path, startRatio);
  const end = polylineInterpolateByRatio(path, endRatio);

  if (startRatio === endRatio) {
    return [start, end];
  }

  const line = lineString(path.map((point) => [point.lng, point.lat]));
  const totalKm = turfLength(line, { units: "kilometers" });
  const startKm = totalKm * startRatio;
  const endKm = totalKm * endRatio;

  const picked: LngLatAltLiteral<number>[] = [start];
  let acc = 0;
  for (let i = 1; i < path.length; i += 1) {
    const prev = path[i - 1];
    const next = path[i];
    const segKm = haversine(prev.lng, prev.lat, next.lng, next.lat);
    const segStart = acc;
    const segEnd = acc + segKm;
    if (segStart > startKm && segEnd < endKm) {
      picked.push(next.alt === undefined ? { lng: next.lng, lat: next.lat } : { lng: next.lng, lat: next.lat, alt: next.alt });
    }
    acc = segEnd;
  }
  picked.push(end);
  return picked;
}

export function polygonPerimeter(
  ring: ReadonlyArray<LngLatAltLike>,
  unit: DistanceUnit = "meters",
): number {
  const closed = closeRing(ensureRing(ring));
  const km = turfLength(lineString(closed.map((point) => [point.lng, point.lat])), { units: "kilometers" });
  return kmToDistanceUnit(km, unit);
}

export function polygonArea(
  ring: ReadonlyArray<LngLatAltLike>,
  unit: AreaUnit = "squareMeters",
): number {
  const closed = closeRing(ensureRing(ring));
  const squareMeters = turfArea(polygon([closed.map((point) => [point.lng, point.lat])]));
  return squareMetersToAreaUnit(squareMeters, unit);
}
```
- 设计说明：
  - `coordinate.ts` 统一承载 unit、路径计算、面积计算，Overlay 只做方法暴露。
  - `distance` 与 `area` 分离单位类型，避免量纲错误。

4. `[src/unified-map/geo/index.ts]`
- 变更范围：`new file`
- 修改内容：
```ts
export * from "./transformer";
export * from "./coordinate";
```
- 设计说明：
  - 对外只暴露一个 `geo` 聚合出口，降低导入分散度。

5. `[src/unified-map/core/overlay.ts]`
- 变更范围：`L1-L23`（整文件替换）
- 修改内容：
```ts
import { AbstractMapEntity } from "./entity";
import type {
  EmptyEventMap,
  EventMapBase,
  OverlayExtraEventMap,
} from "./events";
import type { OverlayDefinition, OverlayKind } from "./types";
import {
  polylineDistance,
  polylineDistance3d,
  polylineInterpolateByRatio,
  polylineSegmentDistances,
  polylineSliceByRatio,
  polygonArea,
  polygonPerimeter,
  type AreaUnit,
  type DistanceUnit,
  type LngLatAltLike,
  type LngLatAltLiteral,
} from "../geo/coordinate";

export interface OverlayOptions {
  visible?: boolean;
  zIndex?: number;
  metadata?: Record<string, unknown>;
}

export abstract class AbstractOverlay<
  TOptions extends OverlayOptions = OverlayOptions,
  TExtraEvents extends EventMapBase = EmptyEventMap,
> extends AbstractMapEntity<
  TOptions,
  OverlayExtraEventMap<TOptions> & TExtraEvents
> {
  public abstract readonly kind: OverlayKind;

  public abstract toOverlayDefinition(): OverlayDefinition<TOptions>;
}

export interface PolylineOverlayOptions extends OverlayOptions {
  coordinates: ReadonlyArray<LngLatAltLike>;
}

export abstract class AbstractPolylineOverlay<
  TOptions extends PolylineOverlayOptions = PolylineOverlayOptions,
  TExtraEvents extends EventMapBase = EmptyEventMap,
> extends AbstractOverlay<TOptions, TExtraEvents> {
  public readonly kind = "polyline" as const;

  protected getCoordinates(): ReadonlyArray<LngLatAltLike> {
    return this.options.coordinates;
  }

  public distance(unit: DistanceUnit = "meters"): number {
    return polylineDistance(this.getCoordinates(), unit);
  }

  public distance3d(unit: DistanceUnit = "meters"): number {
    return polylineDistance3d(this.getCoordinates(), unit);
  }

  public segmentDistances(unit: DistanceUnit = "meters"): readonly number[] {
    return polylineSegmentDistances(this.getCoordinates(), unit);
  }

  public interpolateByRatio(ratio: number): LngLatAltLiteral<number> {
    return polylineInterpolateByRatio(this.getCoordinates(), ratio);
  }

  public sliceByRatio(
    startRatio: number,
    endRatio: number,
  ): readonly LngLatAltLiteral<number>[] {
    return polylineSliceByRatio(this.getCoordinates(), startRatio, endRatio);
  }
}

export interface PolygonOverlayOptions extends OverlayOptions {
  ring: ReadonlyArray<LngLatAltLike>;
}

export abstract class AbstractPolygonOverlay<
  TOptions extends PolygonOverlayOptions = PolygonOverlayOptions,
  TExtraEvents extends EventMapBase = EmptyEventMap,
> extends AbstractOverlay<TOptions, TExtraEvents> {
  public readonly kind = "polygon" as const;

  protected getRing(): ReadonlyArray<LngLatAltLike> {
    return this.options.ring;
  }

  public perimeter(unit: DistanceUnit = "meters"): number {
    return polygonPerimeter(this.getRing(), unit);
  }

  public area(unit: AreaUnit = "squareMeters"): number {
    return polygonArea(this.getRing(), unit);
  }
}
```
- 设计说明：
  - 这是“部分 Overlay 增方法”的最小且架构正确做法：
    - 不污染所有 Overlay。
    - 把几何方法收敛在专用抽象类。
    - 计算逻辑仍在 `geo`，避免重复实现。

6. `[src/unified-map/index.ts]`
- 变更范围：`L1-L14`（在 core 导出后增加 geo 导出）
- 修改内容：
```ts
export * from "./core/adapter";
export * from "./core/capability";
export * from "./core/control";
export * from "./core/entity";
export * from "./core/events";
export * from "./core/layer";
export * from "./core/map";
export * from "./core/overlay";
export * from "./core/source";
export * from "./core/types";

export * from "./geo";

export * from "./pseudo/demo";
export * from "./pseudo/demo-models";
export * from "./pseudo/pseudo-adapters";
```
- 设计说明：
  - `geo` 进入统一导出面后，业务和扩展层可直接复用坐标/距离工具。

7. `[docs/coordinate-abstraction-integration-plan.md]`
- 变更范围：`全文`
- 修改内容：
```markdown
使用本文当前结构作为唯一方案文档，删除旧版中所有未提及的 Adapter/Map/Event 坐标语义重构内容。
```
- 设计说明：
  - 避免“双方案并存”导致的执行歧义。
  - 严格满足“其余没提到的全删了”。

