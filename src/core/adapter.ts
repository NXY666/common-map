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

export interface AdapterOverlayEntity {
	readonly id: string;
	toOverlayDefinition(): OverlayDefinition;
}

export interface AdapterControlEntity {
	readonly id: string;
	toControlDefinition(): ControlDefinition;
}

export interface AdapterHandles {
	map: unknown;

	source: unknown;

	layer: unknown;

	overlay: unknown;

	control: unknown;
}

export abstract class AbstractMapAdapter<
	THandles extends AdapterHandles = AdapterHandles,
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

	// createMap() 完成原生地图初始化，包含初始视图和运行时选项
	// 容器仅使用 target.container
	public abstract createMap(
		target: MapMountTarget,
		options: Readonly<UnifiedMapOptions>,
		eventBridge: MapEventBridge,
	): THandles["map"];

	public abstract destroyMap(mapHandle: THandles["map"]): void;

	// setView() 只发起视角变更；状态生效后由适配器补发 viewChanged
	public abstract setView(
		mapHandle: THandles["map"],
		view: CameraState,
		transition?: CameraTransition,
	): void;

	public abstract getView(mapHandle: THandles["map"]): CameraState;

	public abstract updateMapOptions(
		mapHandle: THandles["map"],
		nextOptions: Readonly<UnifiedMapRuntimeOptions>,
		previousOptions: Readonly<UnifiedMapRuntimeOptions>,
	): void;

	public abstract project(
		mapHandle: THandles["map"],
		lngLat: LngLatLike,
	): ScreenPoint;

	public abstract unproject(
		mapHandle: THandles["map"],
		point: ScreenPoint,
	): LngLatLiteral;

	public abstract mountSource(
		mapHandle: THandles["map"],
		source: AbstractSource,
	): THandles["source"];

	public abstract updateSource(
		mapHandle: THandles["map"],
		source: AbstractSource,
		sourceHandle: THandles["source"],
	): void;

	public abstract unmountSource(
		mapHandle: THandles["map"],
		source: AbstractSource,
		sourceHandle: THandles["source"],
	): void;

	public abstract mountLayer(
		mapHandle: THandles["map"],
		layer: AbstractLayer,
	): THandles["layer"];

	public abstract updateLayer(
		mapHandle: THandles["map"],
		layer: AbstractLayer,
		layerHandle: THandles["layer"],
	): void;

	public abstract unmountLayer(
		mapHandle: THandles["map"],
		layer: AbstractLayer,
		layerHandle: THandles["layer"],
	): void;

	public abstract mountOverlay(
		mapHandle: THandles["map"],
		overlay: AdapterOverlayEntity,
	): THandles["overlay"];

	public abstract updateOverlay(
		mapHandle: THandles["map"],
		overlay: AdapterOverlayEntity,
		overlayHandle: THandles["overlay"],
	): void;

	public abstract unmountOverlay(
		mapHandle: THandles["map"],
		overlay: AdapterOverlayEntity,
		overlayHandle: THandles["overlay"],
	): void;

	public abstract mountControl(
		mapHandle: THandles["map"],
		control: AdapterControlEntity,
	): THandles["control"];

	public abstract updateControl(
		mapHandle: THandles["map"],
		control: AdapterControlEntity,
		controlHandle: THandles["control"],
	): void;

	public abstract unmountControl(
		mapHandle: THandles["map"],
		control: AdapterControlEntity,
		controlHandle: THandles["control"],
	): void;

	protected record(entry: string): void {
		this.operationLog.push(entry);
		this.fire("logged", {entry});
	}
}
