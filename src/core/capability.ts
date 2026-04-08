import type {ControlDefinition, OverlayDefinition} from "./types";

export type CapabilityLevel = "none" | "emulated" | "native";

export type MapCapability =
	| "camera.bearing"
	| "camera.pitch"
	| "style.swap"
	| "source.management"
	| "layer.management"
	| "overlay.dom"
	| "overlay.vector"
	| "overlay.marker"
	| "overlay.popup"
	| "overlay.polyline"
	| "overlay.polygon"
	| "overlay.circle"
	| "overlay.marker.drag"
	| "overlay.marker.bindPopup"
	| "overlay.popup.open"
	| "control.navigation"
	| "control.scale"
	| "control.fullscreen"
	| "control.fullscreen.active"
	| "control.geolocate"
	| "control.geolocate.tracking"
	| "control.attribution"
	| "control.custom"
	| "projection.screen"
	| "events.map-pointer"
	| "events.layer-pointer"
	| "events.overlay-pointer"
	| "events.overlay-drag"
	| "events.keyboard"
	| "query.features"
	| "cluster.geojson"
	| "terrain";

export interface CapabilityDescriptor {
	level: CapabilityLevel;

	summary: string;

	fallback?: string;
}

// 集中维护 capability 字面量
export const mapCapabilityKeys = {
	overlay: {
		dom: "overlay.dom",
		vector: "overlay.vector",
		marker: "overlay.marker",
		popup: "overlay.popup",
		polyline: "overlay.polyline",
		polygon: "overlay.polygon",
		circle: "overlay.circle",
		markerDrag: "overlay.marker.drag",
		markerBindPopup: "overlay.marker.bindPopup",
		popupOpen: "overlay.popup.open",
	},
	control: {
		navigation: "control.navigation",
		scale: "control.scale",
		fullscreen: "control.fullscreen",
		fullscreenActive: "control.fullscreen.active",
		geolocate: "control.geolocate",
		geolocateTracking: "control.geolocate.tracking",
		attribution: "control.attribution",
		custom: "control.custom",
	},
} as const;

function readBooleanFlag(options: object, key: string): boolean {
	return (options as Record<string, unknown>)[key] === true;
}

export function getOverlayRequiredCapabilities(
	definition: OverlayDefinition,
): readonly MapCapability[] {
	// 根据 definition 推导 overlay 所需 capability
	switch (definition.kind) {
		case "marker": {
			const required: MapCapability[] = [
				mapCapabilityKeys.overlay.dom,
				mapCapabilityKeys.overlay.marker,
			];

			if (readBooleanFlag(definition.options, "draggable")) {
				required.push(mapCapabilityKeys.overlay.markerDrag);
			}

			if (
				"popupId" in definition &&
				typeof definition.popupId === "string" &&
				definition.popupId.length > 0
			) {
				required.push(mapCapabilityKeys.overlay.markerBindPopup);
			}

			return required;
		}
		case "popup": {
			const required: MapCapability[] = [
				mapCapabilityKeys.overlay.dom,
				mapCapabilityKeys.overlay.popup,
			];

			if (readBooleanFlag(definition.options, "open")) {
				required.push(mapCapabilityKeys.overlay.popupOpen);
			}

			return required;
		}
		case "dom":
			return [mapCapabilityKeys.overlay.dom];
		case "polyline":
			return [
				mapCapabilityKeys.overlay.vector,
				mapCapabilityKeys.overlay.polyline,
			];
		case "polygon":
			return [
				mapCapabilityKeys.overlay.vector,
				mapCapabilityKeys.overlay.polygon,
			];
		case "circle":
			return [
				mapCapabilityKeys.overlay.vector,
				mapCapabilityKeys.overlay.circle,
			];
		default:
			return [];
	}
}

export function getControlRequiredCapabilities(
	definition: ControlDefinition,
): readonly MapCapability[] {
	switch (definition.kind) {
		case "navigation":
			return [mapCapabilityKeys.control.navigation];
		case "scale":
			return [mapCapabilityKeys.control.scale];
		case "fullscreen": {
			const required: MapCapability[] = [mapCapabilityKeys.control.fullscreen];

			if (readBooleanFlag(definition.options, "active")) {
				required.push(mapCapabilityKeys.control.fullscreenActive);
			}

			return required;
		}
		case "geolocate": {
			const required: MapCapability[] = [mapCapabilityKeys.control.geolocate];

			if (readBooleanFlag(definition.options, "tracking")) {
				required.push(mapCapabilityKeys.control.geolocateTracking);
			}

			return required;
		}
		case "attribution":
			return [mapCapabilityKeys.control.attribution];
		case "custom":
			return [mapCapabilityKeys.control.custom];
		default:
			return [];
	}
}

const levelRank: Record<CapabilityLevel, number> = {
	none: 0,
	emulated: 1,
	native: 2,
};

export abstract class AbstractCapabilityProfile<
	TCapability extends string = MapCapability,
> {
	public abstract readonly engine: string;

	protected abstract readonly capabilityTable: Readonly<
		Record<TCapability, CapabilityDescriptor>
	>;

	public get(capability: TCapability): CapabilityDescriptor {
		return (
			this.capabilityTable[capability] ?? {
				level: "none",
				summary: `Capability "${capability}" is not declared.`,
			}
		);
	}

	public supports(
		capability: TCapability,
		minimum: CapabilityLevel = "emulated",
	): boolean {
		return levelRank[this.get(capability).level] >= levelRank[minimum];
	}

	public assert(
		capability: TCapability,
		minimum: CapabilityLevel = "emulated",
	): void {
		// 能力不足时抛出错误
		if (!this.supports(capability, minimum)) {
			const descriptor = this.get(capability);
			const fallback = descriptor.fallback
				? ` Fallback: ${descriptor.fallback}`
				: "";
			throw new Error(
				`[${this.engine}] does not satisfy capability "${capability}" at level "${minimum}".${fallback}`,
			);
		}
	}

	public list(): Array<[TCapability, CapabilityDescriptor]> {
		return Object.entries(this.capabilityTable) as Array<
			[TCapability, CapabilityDescriptor]
		>;
	}
}

export class StaticCapabilityProfile extends AbstractCapabilityProfile {
	public readonly engine: string;

	protected readonly capabilityTable: Readonly<
		Record<MapCapability, CapabilityDescriptor>
	>;

	public constructor(
		engine: string,
		capabilityTable: Readonly<Record<MapCapability, CapabilityDescriptor>>,
	) {
		super();
		this.engine = engine;
		this.capabilityTable = capabilityTable;
	}
}
