import {AbstractCapabilityProfile} from "./capability";
import {type AdapterEvent, type EventMapBase, TypedEvented} from "./events";
import type {AbstractControl, ControlOptions} from "./control";
import type {AbstractLayer} from "./layer";
import type {AbstractOverlay, OverlayOptions} from "./overlay";
import type {AbstractSource} from "./source";
import type {MapEventBridge} from "./internal-events";
import type {
	CameraState,
	CameraTransition,
	ControlDefinition,
	LngLatLike,
	LngLatLiteral,
	MapMountTarget,
	OverlayDefinition,
	ScreenPoint,
	UnifiedMapOptions,
	UnifiedMapRuntimeOptions,
} from "./types";

type AdapterOverlayEntity = AbstractOverlay<OverlayOptions, OverlayDefinition, EventMapBase>;
type AdapterControlEntity = AbstractControl<ControlOptions, ControlDefinition, EventMapBase>;

export interface AdapterHandles {
	map: unknown;

	source: unknown;

	layer: unknown;

	overlay: unknown;

	control: unknown;
}

export abstract class AbstractMapAdapter<
	H extends AdapterHandles = AdapterHandles,
> extends TypedEvented<AdapterEvent> {
	public abstract readonly engine: string;

	protected readonly operationLog: string[] = [];

	protected constructor(public readonly capabilities: AbstractCapabilityProfile) {
		super();
	}

	public getOperationLog(): readonly string[] {
		return this.operationLog;
	}

	public async load(): Promise<void> {
	}

	// createMap() must fully initialize the native map, including:
	// - options.initialView
	// - initial runtime options such as style / interactive
	// Use target.container as the only native container source of truth.
	// options.target must not be used for native container resolution.
	// AbstractMap.mount() will not apply an additional initial setView() call.
	public abstract createMap(
		target: MapMountTarget,
		options: Readonly<UnifiedMapOptions>,
		eventBridge: MapEventBridge,
	): H["map"];

	public abstract destroyMap(mapHandle: H["map"]): void;

	// setView() only requests a camera change.
	// Adapters must emit viewChanged through the bridge after the native map
	// observes the actual camera state change.
	public abstract setView(
		mapHandle: H["map"],
		view: CameraState,
		transition?: CameraTransition,
	): void;

	public abstract getView(mapHandle: H["map"]): CameraState;

	public abstract updateMapOptions(
		mapHandle: H["map"],
		nextOptions: Readonly<UnifiedMapRuntimeOptions>,
		previousOptions: Readonly<UnifiedMapRuntimeOptions>,
	): void;

	public abstract project(
		mapHandle: H["map"],
		lngLat: LngLatLike,
	): ScreenPoint;

	public abstract unproject(
		mapHandle: H["map"],
		point: ScreenPoint,
	): LngLatLiteral;

	public abstract mountSource(
		mapHandle: H["map"],
		source: AbstractSource,
	): H["source"];

	public abstract updateSource(
		mapHandle: H["map"],
		source: AbstractSource,
		sourceHandle: H["source"],
	): void;

	public abstract unmountSource(
		mapHandle: H["map"],
		source: AbstractSource,
		sourceHandle: H["source"],
	): void;

	public abstract mountLayer(
		mapHandle: H["map"],
		layer: AbstractLayer,
	): H["layer"];

	public abstract updateLayer(
		mapHandle: H["map"],
		layer: AbstractLayer,
		layerHandle: H["layer"],
	): void;

	public abstract unmountLayer(
		mapHandle: H["map"],
		layer: AbstractLayer,
		layerHandle: H["layer"],
	): void;

	public abstract mountOverlay(
		mapHandle: H["map"],
		overlay: AdapterOverlayEntity,
	): H["overlay"];

	public abstract updateOverlay(
		mapHandle: H["map"],
		overlay: AdapterOverlayEntity,
		overlayHandle: H["overlay"],
	): void;

	public abstract unmountOverlay(
		mapHandle: H["map"],
		overlay: AdapterOverlayEntity,
		overlayHandle: H["overlay"],
	): void;

	public abstract mountControl(
		mapHandle: H["map"],
		control: AdapterControlEntity,
	): H["control"];

	public abstract updateControl(
		mapHandle: H["map"],
		control: AdapterControlEntity,
		controlHandle: H["control"],
	): void;

	public abstract unmountControl(
		mapHandle: H["map"],
		control: AdapterControlEntity,
		controlHandle: H["control"],
	): void;

	protected record(entry: string): void {
		this.operationLog.push(entry);
		this.fire("logged", {entry});
	}
}
