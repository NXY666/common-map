import {
	type EmptyEventMap,
	type EventPayload,
	type EventType,
	type MapAdapterEvent,
	type MapEvent,
	type Subscription,
	TypedEvented,
} from "./events";
import {getControlRequiredCapabilities, getOverlayRequiredCapabilities, type MapCapability,} from "./capability";
import type {AbstractMapAdapter, AdapterHandles} from "./adapter";
import type {AbstractControl, ControlOptions} from "./control";
import type {AbstractLayer, BaseLayerOptions} from "./layer";
import type {AbstractOverlay, OverlayOptions} from "./overlay";
import type {AbstractSource} from "./source";
import type {
	CameraState,
	CameraTransition,
	ControlDefinition,
	LayerDefinition,
	LngLatLike,
	LngLatLiteral,
	MapLifecycleState,
	OverlayDefinition,
	ScreenPoint,
	SourceDefinition,
	UnifiedMapOptions,
	UnifiedMapRuntimeOptions,
	UnifiedMapStyle,
} from "./types";
import {bindManagedEntity, mountManagedEntity, releaseManagedEntity, unmountManagedEntity, type EntityLifecycleAccess,} from "./internal-lifecycle";
import {adapterEventEmitterSymbol} from "./internal-event-bridge";
import {createMapEventBridge} from "./internal-events";

interface RemoveSourceOptions {
	cascade?: boolean;
}

function combineSubscriptions(subscriptions: readonly Subscription[]): Subscription {
	return {
		unsubscribe: () => {
			for (const subscription of subscriptions) {
				subscription.unsubscribe();
			}
		},
	};
}

function createDefaultView(): CameraState {
	return {
		center: {lng: 0, lat: 0},
		zoom: 0,
		bearing: 0,
		pitch: 0,
	};
}

type MapSourceEntity<TSourceHandle> = AbstractSource<
	object,
	SourceDefinition,
	TSourceHandle
>;
type MapLayerEntity<TLayerHandle> = AbstractLayer<
	BaseLayerOptions,
	LayerDefinition,
	TLayerHandle
>;

interface MapOverlayLifecycle<TOverlayHandle = unknown> {
	readonly id: string;
	isDisposed(): boolean;
	isMounted(): boolean;
	attachToMap(
		map: AbstractMap,
		nativeHandle: TOverlayHandle,
		access: EntityLifecycleAccess,
	): void;
	detachFromMap(access: EntityLifecycleAccess): void;
	getNativeHandle(): TOverlayHandle;
}

interface MapOverlayCapability {
	toOverlayDefinition(): OverlayDefinition;
	on(event: "updated", listener: () => void): Subscription;
}

type MapOverlayEntity<TOverlayHandle> = MapOverlayLifecycle<TOverlayHandle> & MapOverlayCapability;

interface MapControlLifecycle<TControlHandle = unknown> {
	readonly id: string;
	isDisposed(): boolean;
	isMounted(): boolean;
	attachToMap(
		map: AbstractMap,
		nativeHandle: TControlHandle,
		access: EntityLifecycleAccess,
	): void;
	detachFromMap(access: EntityLifecycleAccess): void;
	getNativeHandle(): TControlHandle;
}

interface MapControlCapability {
	toControlDefinition(): ControlDefinition;
	on(event: "updated", listener: () => void): Subscription;
}

type MapControlEntity<TControlHandle> = MapControlLifecycle<TControlHandle> & MapControlCapability;

type ManagedEntityKind = "source" | "layer" | "overlay" | "control";

interface MapManagedEntityLifecycle<TNativeHandle = unknown> {
	readonly id: string;
	isDisposed(): boolean;
	isMounted(): boolean;
	attachToMap(
		map: AbstractMap,
		nativeHandle: TNativeHandle,
		access: EntityLifecycleAccess,
	): void;
	detachFromMap(access: EntityLifecycleAccess): void;
}

export abstract class AbstractMap<
	H extends AdapterHandles = AdapterHandles,
> extends TypedEvented<MapEvent> {
	public readonly id: string;

	public readonly adapter: AbstractMapAdapter<H>;

	protected readonly options: UnifiedMapOptions;

	protected nativeMap?: H["map"];

	protected readonly sources = new Map<string, MapSourceEntity<H["source"]>>();

	protected readonly layers = new Map<string, MapLayerEntity<H["layer"]>>();

	protected readonly overlays = new Map<string, MapOverlayEntity<H["overlay"]>>();

	protected readonly controls = new Map<string, MapControlEntity<H["control"]>>();

	private runtimeOptions: UnifiedMapRuntimeOptions;

	private loadPromise?: Promise<void>;

	private loaded = false;

	private stateValue: MapLifecycleState = "created";

	private readonly subscriptions = new Map<string, Subscription>();

	protected constructor(
		adapter: AbstractMapAdapter<H>,
		options: UnifiedMapOptions,
	) {
		super();
		this.adapter = adapter;
		this.options = options;
		this.id = options.id;
		this.runtimeOptions = {
			style: options.style,
			interactive: options.interactive,
		};
	}

	public get state(): MapLifecycleState {
		return this.stateValue;
	}

	public get isMounted(): boolean {
		return this.stateValue === "mounted";
	}

	public get isDestroyed(): boolean {
		return this.stateValue === "destroyed";
	}

	public get isLoaded(): boolean {
		return this.loaded;
	}

	public async load(): Promise<this> {
		if (this.isDestroyed) {
			console.warn(`Map has been destroyed and cannot load.`);
			return this;
		}

		if (this.loaded) {
			return this;
		}

		if (!this.loadPromise) {
			this.loadPromise = this.adapter.load().then(() => {
				this.loaded = true;
			});
			this.loadPromise = this.loadPromise.catch((error: unknown) => {
				this.loadPromise = undefined;
				throw error;
			});
		}

		await this.loadPromise;
		return this;
	}

	public mount(target = this.options.target): this {
		if (this.isDestroyed) {
			console.warn("Cannot mount a destroyed map.");
			return this;
		}

		if (this.isMounted) {
			return this;
		}

		if (!this.loaded) {
			console.warn("Cannot mount before load().");
			return this;
		}

		if (!target) {
			console.warn("Cannot mount without a target.");
			return this;
		}

		let nativeMap: H["map"] | undefined;
		try {
			nativeMap = this.adapter.createMap(
				{container: target},
				this.getResolvedOptions(target),
				createMapEventBridge(this),
			);
		} catch (error) {
			this.fireError(
				"mount",
				`Failed to create native map for "${this.id}".`,
				error,
			);
		}

		if (nativeMap === undefined) {
			return this;
		}

		this.nativeMap = nativeMap;
		this.stateValue = "mounted";

		this.mountManagedCollection(this.sources, "source", (entity) => {
			this.materializeSource(entity);
		});
		this.mountManagedCollection(this.layers, "layer", (entity) => {
			this.materializeLayer(entity);
		});
		this.mountManagedCollection(this.overlays, "overlay", (entity) => {
			this.materializeOverlay(entity);
		});
		this.mountManagedCollection(this.controls, "control", (entity) => {
			this.materializeControl(entity);
		});

		this.fire("mounted", {
			mapId: this.id,
			engine: this.adapter.engine,
		});

		return this;
	}

	public unmount(): this {
		if (this.isDestroyed) {
			console.warn("Cannot unmount a destroyed map.");
			return this;
		}

		const nativeMap = this.nativeMap;
		if (!nativeMap) {
			return this;
		}

		const operation = "unmount" as const;

		this.unmountManagedCollection(this.controls, operation, (entity, op) => {
			this.dematerializeControl(entity, op);
		});
		this.unmountManagedCollection(this.overlays, operation, (entity, op) => {
			this.dematerializeOverlay(entity, op);
		});
		this.unmountManagedCollection(this.layers, operation, (entity, op) => {
			this.dematerializeLayer(entity, op);
		});
		this.unmountManagedCollection(this.sources, operation, (entity, op) => {
			this.dematerializeSource(entity, op);
		});

		this.destroyNativeMap(nativeMap, operation);
		this.nativeMap = undefined;
		this.stateValue = "created";

		this.fire("unmounted", {
			mapId: this.id,
			engine: this.adapter.engine,
		});

		return this;
	}

	public destroy(): this {
		if (this.isDestroyed) {
			return this;
		}

		if (this.stateValue === "mounted") {
			this.unmount();
		}

		this.releaseManagedCollection(this.controls, "control");
		this.releaseManagedCollection(this.overlays, "overlay");
		this.releaseManagedCollection(this.layers, "layer");
		this.releaseManagedCollection(this.sources, "source");

		this.stateValue = "destroyed";

		this.fire("destroyed", {
			mapId: this.id,
			engine: this.adapter.engine,
		});

		return this;
	}

	public supports(capability: MapCapability): boolean {
		return this.adapter.capabilities.supports(capability);
	}

	public [adapterEventEmitterSymbol]<K extends EventType<MapAdapterEvent>>(
		type: K,
		payload?: EventPayload<MapAdapterEvent, K>,
	): this {
		return super.fire(
			type as EventType<MapEvent>,
			payload as EventPayload<MapEvent, EventType<MapEvent>> | undefined,
		);
	}

	public setView(view: CameraState, transition?: CameraTransition): this {
		if (this.isDestroyed) {
			console.warn(`Map has been destroyed and cannot setView.`);
			return this;
		}

		if (!this.nativeMap) {
			throw new Error(`Map is not mounted.`);
		}

		this.adapter.setView(this.nativeMap, view, transition);
		return this;
	}

	public patchMapOptions(patch: UnifiedMapRuntimeOptions): this {
		if (this.isDestroyed) {
			console.warn(`Map has been destroyed and cannot patchMapOptions.`);
			return this;
		}

		const previousOptions = {
			...this.runtimeOptions,
		};
		const nextOptions = {
			...previousOptions,
			...patch,
		};

		if (this.nativeMap) {
			this.adapter.updateMapOptions(
				this.nativeMap,
				nextOptions,
				previousOptions,
			);
		}

		this.runtimeOptions = nextOptions;
		return this;
	}

	public setStyle(style: UnifiedMapStyle): this {
		return this.patchMapOptions({style});
	}

	public getView(): CameraState {
		if (!this.nativeMap) {
			console.warn(`Map is not mounted.`);
			return createDefaultView();
		}

		return this.adapter.getView(this.nativeMap);
	}

	public project(lngLat: LngLatLike): ScreenPoint {
		if (!this.nativeMap) {
			throw new Error(`Map is not mounted.`);
		}

		return this.adapter.project(this.nativeMap, lngLat);
	}

	public unproject(point: ScreenPoint): LngLatLiteral {
		if (!this.nativeMap) {
			throw new Error(`Map is not mounted.`);
		}

		return this.adapter.unproject(this.nativeMap, point);
	}

	public addSource<TSource extends MapSourceEntity<H["source"]>>(source: TSource): TSource {
		if (this.isDestroyed) {
			console.warn(`Map has been destroyed and cannot addSource.`);
			return source;
		}
		return this.addManagedEntity(this.sources, source, "source", (entity) => {
			this.bindSource(entity);
		}, (entity) => {
			this.materializeSource(entity);
		});
	}

	public getSource(
		sourceId: string,
	): MapSourceEntity<H["source"]> | undefined {
		return this.sources.get(sourceId);
	}

	public removeSource(
		sourceId: string,
		options: RemoveSourceOptions = {},
	): this {
		if (this.isDestroyed) {
			console.warn(`Map has been destroyed and cannot removeSource.`);
			return this;
		}
		const source = this.sources.get(sourceId);
		if (!source) {
			return this;
		}

		const dependentLayers = Array.from(this.layers.values()).filter(
			(layer) => layer.sourceId === sourceId,
		);

		if (dependentLayers.length > 0 && !options.cascade) {
			throw new Error(
				`Cannot remove source "${sourceId}" while layers [${dependentLayers
					.map((layer) => layer.id)
					.join(", ")}] still depend on it.`,
			);
		}

		for (const layer of dependentLayers) {
			this.removeLayer(layer.id);
		}

		this.removeManagedEntity(this.sources, sourceId, (entity) => {
			this.dematerializeSource(entity);
		});
		return this;
	}

	public addLayer<TLayer extends MapLayerEntity<H["layer"]>>(layer: TLayer): TLayer {
		if (this.isDestroyed) {
			console.warn(`Map has been destroyed and cannot addLayer.`);
			return layer;
		}
		if (layer.sourceId && !this.sources.has(layer.sourceId)) {
			throw new Error(
				`Layer "${layer.id}" references missing source "${layer.sourceId}".`,
			);
		}

		return this.addManagedEntity(this.layers, layer, "layer", (entity) => {
			this.bindLayer(entity);
		}, (entity) => {
			this.materializeLayer(entity);
		});
	}

	public getLayer(
		layerId: string,
	): MapLayerEntity<H["layer"]> | undefined {
		return this.layers.get(layerId);
	}

	public removeLayer(layerId: string): this {
		if (this.isDestroyed) {
			console.warn(`Map has been destroyed and cannot removeLayer.`);
			return this;
		}
		this.removeManagedEntity(this.layers, layerId, (entity) => {
			this.dematerializeLayer(entity);
		});
		return this;
	}

	public addOverlay<
		TOverlay extends AbstractOverlay<
			OverlayOptions,
			OverlayDefinition,
			EmptyEventMap,
			H["overlay"]
		>
	>(overlay: TOverlay): TOverlay {
		if (this.isDestroyed) {
			console.warn(`Map has been destroyed and cannot addOverlay.`);
			return overlay;
		}
		if (this.nativeMap) {
			this.assertOverlayCapabilities(overlay);
		}

		return this.addManagedEntity(this.overlays, overlay, "overlay", (entity) => {
			this.bindOverlay(entity);
		}, (entity) => {
			this.materializeOverlay(entity);
		});
	}

	public getOverlay(
		overlayId: string,
	): MapOverlayEntity<H["overlay"]> | undefined {
		return this.overlays.get(overlayId);
	}

	public removeOverlay(overlayId: string): this {
		if (this.isDestroyed) {
			console.warn(`Map has been destroyed and cannot removeOverlay.`);
			return this;
		}
		this.removeManagedEntity(this.overlays, overlayId, (entity) => {
			this.dematerializeOverlay(entity);
		});
		return this;
	}

	public addControl<
		TControl extends AbstractControl<
			ControlOptions,
			ControlDefinition,
			EmptyEventMap,
			H["control"]
		>
	>(control: TControl): TControl {
		if (this.isDestroyed) {
			console.warn(`Map has been destroyed and cannot addControl.`);
			return control;
		}
		if (this.nativeMap) {
			this.assertControlCapabilities(control);
		}

		return this.addManagedEntity(this.controls, control, "control", (entity) => {
			this.bindControl(entity);
		}, (entity) => {
			this.materializeControl(entity);
		});
	}

	public getControl(
		controlId: string,
	): MapControlEntity<H["control"]> | undefined {
		return this.controls.get(controlId);
	}

	public removeControl(controlId: string): this {
		if (this.isDestroyed) {
			console.warn(`Map has been destroyed and cannot removeControl.`);
			return this;
		}
		this.removeManagedEntity(this.controls, controlId, (entity) => {
			this.dematerializeControl(entity);
		});
		return this;
	}

	private mountManagedCollection<TEntity extends {readonly id: string}>(
		registry: Map<string, TEntity>,
		entityKind: ManagedEntityKind,
		materialize: (entity: TEntity) => void,
	): void {
		for (const entity of registry.values()) {
			try {
				materialize(entity);
			} catch (error) {
				this.fireError("mount", `Failed to mount ${entityKind} "${entity.id}".`, error, entityKind, entity.id);
			}
		}
	}

	private unmountManagedCollection<TEntity extends {readonly id: string}>(
		registry: Map<string, TEntity>,
		operation: "unmount" | "destroy",
		dematerialize: (entity: TEntity, operation: "unmount" | "destroy") => void,
	): void {
		for (const entity of Array.from(registry.values()).reverse()) {
			dematerialize(entity, operation);
		}
	}

	private releaseManagedCollection<TEntity extends MapManagedEntityLifecycle>(
		registry: Map<string, TEntity>,
		entityKind: ManagedEntityKind,
	): void {
		for (const entity of Array.from(registry.values()).reverse()) {
			try {
				releaseManagedEntity(entity, this);
			} catch (error) {
				this.fireError("destroy", `Failed to release ${entityKind} "${entity.id}" during destroy.`, error, entityKind, entity.id);
			}
			this.unbindEntity(entity.id);
		}

		registry.clear();
	}

	private addManagedEntity<
		TEntity extends MapManagedEntityLifecycle,
		TSpecificEntity extends TEntity,
	>(
		registry: Map<string, TEntity>,
		entity: TSpecificEntity,
		entityKind: ManagedEntityKind,
		bind: (entity: TEntity) => void,
		materialize: (entity: TEntity) => void,
	): TSpecificEntity {
		this.ensureUnique(registry, entity.id, entityKind);
		bindManagedEntity(entity, this);
		registry.set(entity.id, entity);
		bind(entity);

		if (this.nativeMap) {
			materialize(entity);
		}

		return entity;
	}

	private removeManagedEntity<TEntity extends MapManagedEntityLifecycle>(
		registry: Map<string, TEntity>,
		entityId: string,
		dematerialize: (entity: TEntity) => void,
	): void {
		const entity = registry.get(entityId);
		if (!entity) {
			return;
		}

		if (this.nativeMap) {
			dematerialize(entity);
		}

		releaseManagedEntity(entity, this);
		this.unbindEntity(entity.id);
		registry.delete(entityId);
	}

	private bindSource(source: MapSourceEntity<H["source"]>): void {
		this.unbindEntity(source.id);

		let refreshQueued = false;
		const requestRefresh = (): void => {
			if (refreshQueued) {
				return;
			}

			refreshQueued = true;
			queueMicrotask(() => {
				refreshQueued = false;

				if (!this.nativeMap || !source.isMounted()) {
					return;
				}

				this.adapter.updateSource(
					this.nativeMap,
					source,
					source.getNativeHandle(),
				);
			});
		};

		this.subscriptions.set(
			source.id,
			combineSubscriptions([
				source.on("updated", requestRefresh),
				source.on("dataChanged", requestRefresh),
			]),
		);
	}

	private bindLayer(layer: MapLayerEntity<H["layer"]>): void {
		this.unbindEntity(layer.id);
		this.subscriptions.set(
			layer.id,
			layer.on("updated", () => {
				if (!this.nativeMap || !layer.isMounted()) {
					return;
				}

				this.adapter.updateLayer(
					this.nativeMap,
					layer,
					layer.getNativeHandle(),
				);
			}),
		);
	}

	private bindOverlay(overlay: MapOverlayEntity<H["overlay"]>): void {
		this.unbindEntity(overlay.id);
		this.subscriptions.set(
			overlay.id,
			overlay.on("updated", () => {
				if (!this.nativeMap || !overlay.isMounted()) {
					return;
				}

				this.assertOverlayCapabilities(overlay);

				this.adapter.updateOverlay(
					this.nativeMap,
					overlay,
					overlay.getNativeHandle(),
				);
			}),
		);
	}

	private bindControl(control: MapControlEntity<H["control"]>): void {
		this.unbindEntity(control.id);
		this.subscriptions.set(
			control.id,
			control.on("updated", () => {
				if (!this.nativeMap || !control.isMounted()) {
					return;
				}

				this.assertControlCapabilities(control);

				this.adapter.updateControl(
					this.nativeMap,
					control,
					control.getNativeHandle(),
				);
			}),
		);
	}

	private unbindEntity(entityId: string): void {
		this.subscriptions.get(entityId)?.unsubscribe();
		this.subscriptions.delete(entityId);
	}

	private materializeSource(source: MapSourceEntity<H["source"]>): void {
		if (!this.nativeMap || source.isMounted()) {
			return;
		}

		const handle = this.adapter.mountSource(this.nativeMap, source);
		mountManagedEntity(source, this, handle);
	}

	private dematerializeSource(
		source: MapSourceEntity<H["source"]>,
		operation?: "unmount" | "destroy",
	): void {
		if (!this.nativeMap || !source.isMounted()) {
			return;
		}

		if (!operation) {
			this.adapter.unmountSource(this.nativeMap, source, source.getNativeHandle());
			unmountManagedEntity(source);
			return;
		}

		try {
			this.adapter.unmountSource(this.nativeMap, source, source.getNativeHandle());
		} catch (error) {
			this.fireError(operation, `Failed to unmount source "${source.id}".`, error, "source", source.id);
		}

		if (!source.isMounted()) {
			return;
		}

		try {
			unmountManagedEntity(source);
		} catch (error) {
			this.fireError(operation, `Failed to detach mounted source "${source.id}" after ${operation}.`, error, "source", source.id);
		}
	}

	private materializeLayer(layer: MapLayerEntity<H["layer"]>): void {
		if (!this.nativeMap || layer.isMounted()) {
			return;
		}

		const handle = this.adapter.mountLayer(this.nativeMap, layer);
		mountManagedEntity(layer, this, handle);
	}

	private dematerializeLayer(
		layer: MapLayerEntity<H["layer"]>,
		operation?: "unmount" | "destroy",
	): void {
		if (!this.nativeMap || !layer.isMounted()) {
			return;
		}

		if (!operation) {
			this.adapter.unmountLayer(this.nativeMap, layer, layer.getNativeHandle());
			unmountManagedEntity(layer);
			return;
		}

		try {
			this.adapter.unmountLayer(this.nativeMap, layer, layer.getNativeHandle());
		} catch (error) {
			this.fireError(operation, `Failed to unmount layer "${layer.id}".`, error, "layer", layer.id);
		}

		if (!layer.isMounted()) {
			return;
		}

		try {
			unmountManagedEntity(layer);
		} catch (error) {
			this.fireError(operation, `Failed to detach mounted layer "${layer.id}" after ${operation}.`, error, "layer", layer.id);
		}
	}

	private materializeOverlay(overlay: MapOverlayEntity<H["overlay"]>): void {
		if (!this.nativeMap || overlay.isMounted()) {
			return;
		}

		this.assertOverlayCapabilities(overlay);

		const handle = this.adapter.mountOverlay(this.nativeMap, overlay);
		mountManagedEntity(overlay, this, handle);
	}

	private dematerializeOverlay(
		overlay: MapOverlayEntity<H["overlay"]>,
		operation?: "unmount" | "destroy",
	): void {
		if (!this.nativeMap || !overlay.isMounted()) {
			return;
		}

		if (!operation) {
			this.adapter.unmountOverlay(
				this.nativeMap,
				overlay,
				overlay.getNativeHandle(),
			);
			unmountManagedEntity(overlay);
			return;
		}

		try {
			this.adapter.unmountOverlay(
				this.nativeMap,
				overlay,
				overlay.getNativeHandle(),
			);
		} catch (error) {
			this.fireError(operation, `Failed to unmount overlay "${overlay.id}".`, error, "overlay", overlay.id);
		}

		if (!overlay.isMounted()) {
			return;
		}

		try {
			unmountManagedEntity(overlay);
		} catch (error) {
			this.fireError(operation, `Failed to detach mounted overlay "${overlay.id}" after ${operation}.`, error, "overlay", overlay.id);
		}
	}

	private materializeControl(control: MapControlEntity<H["control"]>): void {
		if (!this.nativeMap || control.isMounted()) {
			return;
		}

		this.assertControlCapabilities(control);

		const handle = this.adapter.mountControl(this.nativeMap, control);
		mountManagedEntity(control, this, handle);
	}

	private dematerializeControl(
		control: MapControlEntity<H["control"]>,
		operation?: "unmount" | "destroy",
	): void {
		if (!this.nativeMap || !control.isMounted()) {
			return;
		}

		if (!operation) {
			this.adapter.unmountControl(
				this.nativeMap,
				control,
				control.getNativeHandle(),
			);
			unmountManagedEntity(control);
			return;
		}

		try {
			this.adapter.unmountControl(
				this.nativeMap,
				control,
				control.getNativeHandle(),
			);
		} catch (error) {
			this.fireError(operation, `Failed to unmount control "${control.id}".`, error, "control", control.id);
		}

		if (!control.isMounted()) {
			return;
		}

		try {
			unmountManagedEntity(control);
		} catch (error) {
			this.fireError(operation, `Failed to detach mounted control "${control.id}" after ${operation}.`, error, "control", control.id);
		}
	}

	private destroyNativeMap(
		nativeMap: H["map"],
		operation: "unmount" | "destroy",
	): void {
		try {
			this.adapter.destroyMap(nativeMap);
		} catch (error) {
			this.fireError(
				operation,
				`Failed to destroy native map during ${operation}.`,
				error,
			);
		}
	}

	private ensureUnique<TValue>(
		registry: Map<string, TValue>,
		id: string,
		label: string,
	): void {
		if (registry.has(id)) {
			throw new Error(`Duplicate ${label} id "${id}" on map "${this.id}".`);
		}
	}

	private assertOverlayCapabilities(overlay: MapOverlayEntity<H["overlay"]>): void {
		const definition = overlay.toOverlayDefinition();

		for (const capability of getOverlayRequiredCapabilities(definition)) {
			this.adapter.capabilities.assert(capability);
		}
	}

	private assertControlCapabilities(control: MapControlEntity<H["control"]>): void {
		const definition = control.toControlDefinition();

		for (const capability of getControlRequiredCapabilities(definition)) {
			this.adapter.capabilities.assert(capability);
		}
	}

	private fireError(
		operation: "mount" | "unmount" | "destroy",
		message: string,
		error: unknown,
		entityKind?: "map" | "source" | "layer" | "overlay" | "control" | undefined,
		entityId?: string | undefined
	): void {
		console.warn(message);
		this.fire("error", {
			mapId: this.id,
			operation,
			message,
			error,
			entityKind,
			entityId
		});
	}

	private getResolvedOptions(target = this.options.target): UnifiedMapOptions {
		return {
			...this.options,
			...this.runtimeOptions,
			initialView: this.options.initialView,
			target,
		};
	}
}
