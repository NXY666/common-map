import {type EventKey, type EventPayload, type MapEventMap, type Subscription, TypedEvented,} from "./events";
import {getControlRequiredCapabilities, getOverlayRequiredCapabilities, type MapCapability,} from "./capability";
import type {AbstractMapAdapter} from "./adapter";
import type {AbstractControl} from "./control";
import type {AbstractLayer} from "./layer";
import type {AbstractOverlay} from "./overlay";
import type {AbstractSource} from "./source";
import type {
  CameraState,
  CameraTransition,
  LngLatLike,
  LngLatLiteral,
  MapLifecycleState,
  ScreenPoint,
  UnifiedMapOptions,
  UnifiedMapRuntimeOptions,
  UnifiedMapStyle,
} from "./types";
import {bindManagedEntity, mountManagedEntity, releaseManagedEntity, unmountManagedEntity,} from "./internal-lifecycle";
import {type AdapterEventAccess, createMapEventBridge, hasAdapterEventAccess,} from "./internal-events";

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

export abstract class AbstractMap extends TypedEvented<MapEventMap> {
  public readonly id: string;

  public readonly adapter: AbstractMapAdapter;

  protected readonly options: UnifiedMapOptions;

  protected nativeMap?: unknown;

  protected readonly sources = new Map<string, AbstractSource>();

  protected readonly layers = new Map<string, AbstractLayer>();

  protected readonly overlays = new Map<string, AbstractOverlay>();

  protected readonly controls = new Map<string, AbstractControl>();

  private runtimeOptions: UnifiedMapRuntimeOptions;

  private loadPromise?: Promise<void>;

  private loaded = false;

  private stateValue: MapLifecycleState = "created";

  private readonly subscriptions = new Map<string, Subscription>();

  protected constructor(
    adapter: AbstractMapAdapter,
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

    let nativeMap: unknown | undefined;
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

    for (const source of this.sources.values()) {
      try {
        this.materializeSource(source);
      } catch (error) {
        this.fireError("mount", `Failed to mount source "${source.id}".`, error, "source", source.id);
      }
    }

    for (const layer of this.layers.values()) {
      try {
        this.materializeLayer(layer);
      } catch (error) {
        this.fireError("mount", `Failed to mount layer "${layer.id}".`, error, "layer", layer.id);
      }
    }

    for (const overlay of this.overlays.values()) {
      try {
        this.materializeOverlay(overlay);
      } catch (error) {
        this.fireError("mount", `Failed to mount overlay "${overlay.id}".`, error, "overlay", overlay.id);
      }
    }

    for (const control of this.controls.values()) {
      try {
        this.materializeControl(control);
      } catch (error) {
        this.fireError("mount", `Failed to mount control "${control.id}".`, error, "control", control.id);
      }
    }

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

    for (const control of Array.from(this.controls.values()).reverse()) {
      this.dematerializeControl(control, operation);
    }

    for (const overlay of Array.from(this.overlays.values()).reverse()) {
      this.dematerializeOverlay(overlay, operation);
    }

    for (const layer of Array.from(this.layers.values()).reverse()) {
      this.dematerializeLayer(layer, operation);
    }

    for (const source of Array.from(this.sources.values()).reverse()) {
      this.dematerializeSource(source, operation);
    }

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

    for (const control of Array.from(this.controls.values()).reverse()) {
      try {
        releaseManagedEntity(control, this);
      } catch (error) {
        this.fireError("destroy", `Failed to release control "${control.id}" during destroy.`, error, "control", control.id);
      }
      this.unbindEntity(control.id);
    }
    this.controls.clear();

    for (const overlay of Array.from(this.overlays.values()).reverse()) {
      try {
        releaseManagedEntity(overlay, this);
      } catch (error) {
        this.fireError("destroy", `Failed to release overlay "${overlay.id}" during destroy.`, error, "overlay", overlay.id);
      }
      this.unbindEntity(overlay.id);
    }
    this.overlays.clear();

    for (const layer of Array.from(this.layers.values()).reverse()) {
      try {
        releaseManagedEntity(layer, this);
      } catch (error) {
        this.fireError("destroy", `Failed to release layer "${layer.id}" during destroy.`, error, "layer", layer.id);
      }
      this.unbindEntity(layer.id);
    }
    this.layers.clear();

    for (const source of Array.from(this.sources.values()).reverse()) {
      try {
        releaseManagedEntity(source, this);
      } catch (error) {
        this.fireError("destroy", `Failed to release source "${source.id}" during destroy.`, error, "source", source.id);
      }
      this.unbindEntity(source.id);
    }
    this.sources.clear();

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

  public emitFromAdapter<K extends EventKey<MapEventMap>>(
    type: K,
    payload: EventPayload<MapEventMap, K> | undefined,
    access: AdapterEventAccess,
  ): this {
    if (!hasAdapterEventAccess(access)) {
      throw new Error(
        `Map interaction events can only be emitted by an adapter bridge.`,
      );
    }

    return this.fire(type, payload);
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

  public addSource<TSource extends AbstractSource>(source: TSource): TSource {
    if (this.isDestroyed) {
      console.warn(`Map has been destroyed and cannot addSource.`);
      return source;
    }
    this.ensureUnique(this.sources, source.id, "source");
    bindManagedEntity(source, this);
    this.sources.set(source.id, source);
    this.bindSource(source);

    if (this.nativeMap) {
      this.materializeSource(source);
    }

    this.fire("sourceAdded", {sourceId: source.id});
    return source;
  }

  public getSource<TSource extends AbstractSource>(
    sourceId: string,
  ): TSource | undefined {
    return this.sources.get(sourceId) as TSource | undefined;
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

    if (this.nativeMap) {
      this.dematerializeSource(source);
    }

    releaseManagedEntity(source, this);
    this.unbindEntity(source.id);
    this.sources.delete(sourceId);
    this.fire("sourceRemoved", {sourceId});
    return this;
  }

  public addLayer<TLayer extends AbstractLayer>(layer: TLayer): TLayer {
    if (this.isDestroyed) {
      console.warn(`Map has been destroyed and cannot addLayer.`);
      return layer;
    }
    if (layer.sourceId && !this.sources.has(layer.sourceId)) {
      throw new Error(
        `Layer "${layer.id}" references missing source "${layer.sourceId}".`,
      );
    }

    this.ensureUnique(this.layers, layer.id, "layer");
    bindManagedEntity(layer, this);
    this.layers.set(layer.id, layer);
    this.bindLayer(layer);

    if (this.nativeMap) {
      this.materializeLayer(layer);
    }

    this.fire("layerAdded", {layerId: layer.id});
    return layer;
  }

  public getLayer<TLayer extends AbstractLayer>(
    layerId: string,
  ): TLayer | undefined {
    return this.layers.get(layerId) as TLayer | undefined;
  }

  public removeLayer(layerId: string): this {
    if (this.isDestroyed) {
      console.warn(`Map has been destroyed and cannot removeLayer.`);
      return this;
    }
    const layer = this.layers.get(layerId);
    if (!layer) {
      return this;
    }

    if (this.nativeMap) {
      this.dematerializeLayer(layer);
    }

    releaseManagedEntity(layer, this);
    this.unbindEntity(layer.id);
    this.layers.delete(layerId);
    this.fire("layerRemoved", {layerId});
    return this;
  }

  public addOverlay<TOverlay extends AbstractOverlay>(overlay: TOverlay): TOverlay {
    if (this.isDestroyed) {
      console.warn(`Map has been destroyed and cannot addOverlay.`);
      return overlay;
    }
    if (this.nativeMap) {
      this.assertOverlayCapabilities(overlay);
    }

    this.ensureUnique(this.overlays, overlay.id, "overlay");
    bindManagedEntity(overlay, this);
    this.overlays.set(overlay.id, overlay);
    this.bindOverlay(overlay);

    if (this.nativeMap) {
      this.materializeOverlay(overlay);
    }

    this.fire("overlayAdded", {overlayId: overlay.id});
    return overlay;
  }

  public getOverlay<TOverlay extends AbstractOverlay>(
    overlayId: string,
  ): TOverlay | undefined {
    return this.overlays.get(overlayId) as TOverlay | undefined;
  }

  public removeOverlay(overlayId: string): this {
    if (this.isDestroyed) {
      console.warn(`Map has been destroyed and cannot removeOverlay.`);
      return this;
    }
    const overlay = this.overlays.get(overlayId);
    if (!overlay) {
      return this;
    }

    if (this.nativeMap) {
      this.dematerializeOverlay(overlay);
    }

    releaseManagedEntity(overlay, this);
    this.unbindEntity(overlay.id);
    this.overlays.delete(overlayId);
    this.fire("overlayRemoved", {overlayId});
    return this;
  }

  public addControl<TControl extends AbstractControl>(control: TControl): TControl {
    if (this.isDestroyed) {
      console.warn(`Map has been destroyed and cannot addControl.`);
      return control;
    }
    if (this.nativeMap) {
      this.assertControlCapabilities(control);
    }

    this.ensureUnique(this.controls, control.id, "control");
    bindManagedEntity(control, this);
    this.controls.set(control.id, control);
    this.bindControl(control);

    if (this.nativeMap) {
      this.materializeControl(control);
    }

    this.fire("controlAdded", {controlId: control.id});
    return control;
  }

  public getControl<TControl extends AbstractControl>(
    controlId: string,
  ): TControl | undefined {
    return this.controls.get(controlId) as TControl | undefined;
  }

  public removeControl(controlId: string): this {
    if (this.isDestroyed) {
      console.warn(`Map has been destroyed and cannot removeControl.`);
      return this;
    }
    const control = this.controls.get(controlId);
    if (!control) {
      return this;
    }

    if (this.nativeMap) {
      this.dematerializeControl(control);
    }

    releaseManagedEntity(control, this);
    this.unbindEntity(control.id);
    this.controls.delete(controlId);
    this.fire("controlRemoved", {controlId});
    return this;
  }

  private bindSource(source: AbstractSource): void {
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

  private bindLayer(layer: AbstractLayer): void {
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

  private bindOverlay(overlay: AbstractOverlay): void {
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

  private bindControl(control: AbstractControl): void {
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

  private materializeSource(source: AbstractSource): void {
    if (!this.nativeMap || source.isMounted()) {
      return;
    }

    const handle = this.adapter.mountSource(this.nativeMap, source);
    mountManagedEntity(source, this, handle);
  }

  private dematerializeSource(
    source: AbstractSource,
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

  private materializeLayer(layer: AbstractLayer): void {
    if (!this.nativeMap || layer.isMounted()) {
      return;
    }

    const handle = this.adapter.mountLayer(this.nativeMap, layer);
    mountManagedEntity(layer, this, handle);
  }

  private dematerializeLayer(
    layer: AbstractLayer,
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

  private materializeOverlay(overlay: AbstractOverlay): void {
    if (!this.nativeMap || overlay.isMounted()) {
      return;
    }

    this.assertOverlayCapabilities(overlay);

    const handle = this.adapter.mountOverlay(this.nativeMap, overlay);
    mountManagedEntity(overlay, this, handle);
  }

  private dematerializeOverlay(
    overlay: AbstractOverlay,
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

  private materializeControl(control: AbstractControl): void {
    if (!this.nativeMap || control.isMounted()) {
      return;
    }

    this.assertControlCapabilities(control);

    const handle = this.adapter.mountControl(this.nativeMap, control);
    mountManagedEntity(control, this, handle);
  }

  private dematerializeControl(
    control: AbstractControl,
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
    nativeMap: unknown,
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

  private assertOverlayCapabilities(overlay: AbstractOverlay): void {
    const definition = overlay.toOverlayDefinition();

    for (const capability of getOverlayRequiredCapabilities(definition)) {
      this.adapter.capabilities.assert(capability);
    }
  }

  private assertControlCapabilities(control: AbstractControl): void {
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
