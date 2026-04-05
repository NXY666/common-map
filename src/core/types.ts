export type LngLatTuple = readonly [lng: number, lat: number];

export interface LngLatLiteral {
	lng: number;

	lat: number;
}

export type LngLatLike = LngLatTuple | LngLatLiteral;

export interface ScreenPoint {
	x: number;

	y: number;
}

export interface PixelOffset {
	x: number;

	y: number;
}

export type PixelOffsetLike = PixelOffset | readonly [x: number, y: number];

export type OverlayAnchor =
	| "center"
	| "top"
	| "bottom"
	| "left"
	| "right"
	| "top-left"
	| "top-right"
	| "bottom-left"
	| "bottom-right"
	| "auto";

export type Alignment = "map" | "viewport" | "auto";

export type LengthUnit = "metric" | "imperial" | "nautical";

export interface BoundsLiteral {
	southwest: LngLatLiteral;

	northeast: LngLatLiteral;
}

export interface MapPadding {
	top?: number;

	right?: number;

	bottom?: number;

	left?: number;
}

export interface CameraState {
	center: LngLatLike;

	zoom: number;

	bearing?: number;

	pitch?: number;

	bounds?: BoundsLiteral;

	padding?: MapPadding;
}

export interface CameraTransition {
	animate?: boolean;

	durationMs?: number;

	easing?: "linear" | "ease-in-out" | "fly";
}

export type MapLifecycleState =
	| "created"
	| "mounted"
	| "destroyed";

export type MapContainer = string | HTMLElement;

export interface MapMountTarget {
	container: MapContainer;
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

export type LayerDomain = "data" | "system";

export type DataLayerKind = Exclude<LayerKind, "system">;

export type SystemLayerKind =
	| "basemap"
	| "traffic"
	| "labels"
	| "poi"
	| "transit"
	| "bicycling"
	| "satellite"
	| "roadnet"
	| "buildings"
	| "indoor"
	| "terrain"
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

export type ControlSlot =
	| "top-left"
	| "top-right"
	| "bottom-left"
	| "bottom-right";

export type UnifiedMapStyle = object | string | null;

export interface UnifiedMapRuntimeOptions {
	style?: UnifiedMapStyle;

	interactive?: boolean;
}

export interface UnifiedMapOptions extends UnifiedMapRuntimeOptions {
	id: string;

	target?: MapContainer;

	initialView: CameraState;
}

export interface EngineExtensionMap {
	readonly [engine: string]: unknown;
}

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

export interface BaseLayerDefinition<
	TDomain extends LayerDomain = LayerDomain,
	TKind extends LayerKind = LayerKind,
> {
	id: string;

	kind: TKind;

	domain: TDomain;

	visible?: boolean;

	zIndex?: number;

	metadata?: Record<string, unknown>;
}

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

export interface SystemLayerDefinition<
	TOptions extends object = object,
	TSystemKind extends SystemLayerKind = SystemLayerKind,
> extends BaseLayerDefinition<"system", "system"> {
	systemKind: TSystemKind;

	options: TOptions;
}

export type LayerDefinition<
	TPaint extends object = object,
	TSystemOptions extends object = object,
> = DataLayerDefinition<DataLayerKind, TPaint> | SystemLayerDefinition<TSystemOptions>;

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

export function toLngLatLiteral(value: LngLatLike): LngLatLiteral {
	if (
		typeof value === "object" &&
		!Array.isArray(value) &&
		"lng" in value &&
		"lat" in value
	) {
		return {lng: value.lng, lat: value.lat};
	}

	return {lng: value[0], lat: value[1]};
}

export function describeContainer(container: MapContainer): string {
	if (typeof container === "string") {
		return container;
	}

	return container.id ? `#${container.id}` : "<anonymous-container>";
}
