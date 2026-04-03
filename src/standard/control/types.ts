import type {EventMapBase} from "@/core/events";
import type {ControlOptions} from "@/core/control";
import type {
	ControlDefinition,
	ControlKind,
	ControlSlot,
	LengthUnit,
	LngLatLiteral,
	PixelOffsetLike,
} from "@/core/types";

export type StandardControlKind = Extract<
  ControlKind,
  "navigation" | "scale" | "fullscreen" | "geolocate" | "attribution"
>;

export interface StandardControlOptions extends ControlOptions {
  position?: ControlSlot;
  offset?: PixelOffsetLike;
  visible?: boolean;
  metadata?: Record<string, unknown>;
}

export interface NavigationControlOptions extends StandardControlOptions {
  showZoom?: boolean;
  showCompass?: boolean;
  visualizePitch?: boolean;
}

export interface ScaleControlOptions extends StandardControlOptions {
  unit?: LengthUnit;
  maxWidth?: number;
}

export interface FullscreenControlOptions extends StandardControlOptions {
  active?: boolean;
  container?: HTMLElement;
  pseudo?: boolean;
}

export interface GeolocateControlOptions extends StandardControlOptions {
  tracking?: boolean;
  locateRequestVersion?: number;
  showUserLocation?: boolean;
  showAccuracyCircle?: boolean;
  positionOptions?: PositionOptions;
  fitBoundsMaxZoom?: number;
}

export interface AttributionControlOptions extends StandardControlOptions {
  compact?: boolean;
  customAttribution?: string | readonly string[];
}

export interface BaseStandardControlDefinition<
  TKind extends StandardControlKind,
  TOptions extends object,
> extends ControlDefinition<TOptions> {
  kind: TKind;
}

export interface NavigationControlDefinition
  extends BaseStandardControlDefinition<"navigation", NavigationControlOptions> {}

export interface ScaleControlDefinition
  extends BaseStandardControlDefinition<"scale", ScaleControlOptions> {}

export interface FullscreenControlDefinition
  extends BaseStandardControlDefinition<"fullscreen", FullscreenControlOptions> {}

export interface GeolocateControlDefinition
  extends BaseStandardControlDefinition<"geolocate", GeolocateControlOptions> {}

export interface AttributionControlDefinition
  extends BaseStandardControlDefinition<"attribution", AttributionControlOptions> {}

export type StandardControlDefinition =
  | NavigationControlDefinition
  | ScaleControlDefinition
  | FullscreenControlDefinition
  | GeolocateControlDefinition
  | AttributionControlDefinition;

export interface FullscreenControlEventMap extends EventMapBase {
  activeChanged: { id: string; active: boolean };
  entered: { id: string };
  exited: { id: string };
}

export interface GeolocateControlEventMap extends EventMapBase {
  trackingChanged: { id: string; tracking: boolean };
  geolocate: {
    id: string;
    coordinate: LngLatLiteral;
    accuracyMeters?: number;
  };
  error: {
    id: string;
    code?: number;
    message: string;
  };
}
