import type {EventVariants} from "@/core/events";
import type {ControlOptions} from "@/core/control";
import type {ControlDefinition, ControlKind, LengthUnit, LngLatLiteral,} from "@/core/types";

export type StandardControlKind = Extract<
	ControlKind,
	"navigation" | "scale" | "fullscreen" | "geolocate" | "attribution"
>;

export interface StandardControlOptions extends ControlOptions {
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

export interface NavigationControlDefinition
	extends ControlDefinition<"navigation", NavigationControlOptions> {
}

export interface ScaleControlDefinition
	extends ControlDefinition<"scale", ScaleControlOptions> {
}

export interface FullscreenControlDefinition
	extends ControlDefinition<"fullscreen", FullscreenControlOptions> {
}

export interface GeolocateControlDefinition
	extends ControlDefinition<"geolocate", GeolocateControlOptions> {
}

export interface AttributionControlDefinition
	extends ControlDefinition<"attribution", AttributionControlOptions> {
}

export type StandardControlDefinition =
	| NavigationControlDefinition
	| ScaleControlDefinition
	| FullscreenControlDefinition
	| GeolocateControlDefinition
	| AttributionControlDefinition;

export type FullscreenControlEvent = EventVariants<"entered" | "exited", { id: string }>;

export type GeolocateControlEvent = {
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
};
