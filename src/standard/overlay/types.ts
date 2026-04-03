import type {EventMapBase} from "@/core/events";
import type {OverlayOptions} from "@/core/overlay";
import type {
	Alignment,
	LngLatLike,
	OverlayAnchor,
	OverlayDefinition,
	OverlayKind,
	PixelOffsetLike,
} from "@/core/types";

export type StandardOverlayKind = Extract<
  OverlayKind,
  "marker" | "popup" | "dom" | "polyline" | "polygon" | "circle"
>;

export interface StandardOverlayOptions extends OverlayOptions {
  visible?: boolean;
  zIndex?: number;
  minZoom?: number;
  maxZoom?: number;
  metadata?: Record<string, unknown>;
}

export interface AnchoredOverlayOptions extends StandardOverlayOptions {
  coordinate: LngLatLike;
  anchor?: OverlayAnchor;
  offset?: PixelOffsetLike;
}

export interface PathOverlayOptions extends StandardOverlayOptions {
  coordinates: readonly LngLatLike[];
}

export type MarkerVisual =
  | {
      type: "default";
      color?: string;
      scale?: number;
    }
  | {
      type: "icon";
      url: string;
      size?: readonly [width: number, height: number];
      anchor?: PixelOffsetLike;
      imageOffset?: PixelOffsetLike;
    }
  | {
      type: "html";
      html?: string;
      element?: HTMLElement;
      className?: string;
    };

export type PopupContentLike = string | Node | HTMLElement;

export type DomContentLike = string | HTMLElement | (() => HTMLElement);

export interface MarkerOverlayOptions extends AnchoredOverlayOptions {
  visual?: MarkerVisual;
  draggable?: boolean;
  clickTolerance?: number;
  rotation?: number;
  rotationAlignment?: Alignment;
  pitchAlignment?: Alignment;
}

export interface PopupOverlayOptions extends AnchoredOverlayOptions {
  content?: PopupContentLike;
  open?: boolean;
  closeButton?: boolean;
  closeOnClick?: boolean;
  closeOnMove?: boolean;
  focusAfterOpen?: boolean;
  maxWidth?: string | number;
}

export interface DomOverlayOptions extends AnchoredOverlayOptions {
  content: DomContentLike;
  className?: string;
  interactive?: boolean;
  rotation?: number;
}

export interface PolylineStyle {
  color?: string;
  width?: number;
  opacity?: number;
  dashArray?: readonly number[];
  lineCap?: "butt" | "round" | "square";
  lineJoin?: "miter" | "round" | "bevel";
}

export interface PolygonStyle extends PolylineStyle {
  fillColor?: string;
  fillOpacity?: number;
}

export interface CircleStyle extends PolygonStyle {}

export interface PolylineOverlayOptions extends PathOverlayOptions {
  style?: PolylineStyle;
  curve?: boolean;
}

export interface PolygonOverlayOptions extends PathOverlayOptions {
  style?: PolygonStyle;
}

export interface CircleOverlayOptions extends AnchoredOverlayOptions {
  radius: number;
  style?: CircleStyle;
}

export interface BaseStandardOverlayDefinition<
  TKind extends StandardOverlayKind,
  TOptions extends object,
> extends OverlayDefinition<TOptions> {
  kind: TKind;
}

export interface MarkerOverlayDefinition
  extends BaseStandardOverlayDefinition<"marker", MarkerOverlayOptions> {
  popupId?: string;
}

export interface PopupOverlayDefinition
  extends BaseStandardOverlayDefinition<"popup", PopupOverlayOptions> {}

export interface DomOverlayDefinition
  extends BaseStandardOverlayDefinition<"dom", DomOverlayOptions> {}

export interface PolylineOverlayDefinition
  extends BaseStandardOverlayDefinition<"polyline", PolylineOverlayOptions> {}

export interface PolygonOverlayDefinition
  extends BaseStandardOverlayDefinition<"polygon", PolygonOverlayOptions> {}

export interface CircleOverlayDefinition
  extends BaseStandardOverlayDefinition<"circle", CircleOverlayOptions> {}

export type StandardOverlayDefinition =
  | MarkerOverlayDefinition
  | PopupOverlayDefinition
  | DomOverlayDefinition
  | PolylineOverlayDefinition
  | PolygonOverlayDefinition
  | CircleOverlayDefinition;

export interface AnchoredOverlayEventMap extends EventMapBase {
  coordinateChanged: { id: string; coordinate: LngLatLike };
}

export interface PathOverlayEventMap extends EventMapBase {
  coordinatesChanged: { id: string; coordinates: readonly LngLatLike[] };
}

export interface MarkerOverlayEventMap extends EventMapBase {
  popupBindingChanged: { id: string; popupId: string | undefined };
}

export interface PopupOverlayEventMap extends EventMapBase {
  openChanged: { id: string; open: boolean };
  opened: { id: string };
  closed: { id: string };
}

export interface CircleOverlayEventMap extends EventMapBase {
  radiusChanged: { id: string; radius: number };
}
