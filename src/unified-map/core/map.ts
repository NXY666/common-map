import {
  TypedEvented,
  type EventKey,
  type MapEventMap,
  type EventPayload,
  type Subscription,
} from "./events";
import {
  getControlRequiredCapabilities,
  getOverlayRequiredCapabilities,
  type MapCapability,
} from "./capability";
import type { AbstractMapAdapter } from "./adapter";
import type { AbstractControl } from "./control";
import type { AbstractLayer } from "./layer";
import type { AbstractOverlay } from "./overlay";
import type { AbstractSource } from "./source";
import type {
  CameraState,
  CameraTransition,
  LngLatLike,
  LngLatLiteral,
  ScreenPoint,
  UnifiedMapOptions,
  UnifiedMapRuntimeOptions,
  UnifiedMapStyle,
} from "./types";
import {
  bindManagedEntity,
  mountManagedEntity,
  releaseManagedEntity,
  unmountManagedEntity,
} from "./internal-lifecycle";
import {
  createMapEventBridge,
  hasAdapterEventAccess,
  type AdapterEventAccess,
} from "./internal-events";

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

export abstract class AbstractMap extends TypedEvented<MapEventMap> {
  public readonly id: string;
  public readonly adapter: AbstractMapAdapter;

  protected readonly options: UnifiedMapOptions;
  protected nativeMap?: unknown;
  private runtimeOptions: UnifiedMapRuntimeOptions;
  private loadPromise?: Promise<void>;
  private loaded = false;

  protected readonly sources = new Map<string, AbstractSource>();
  protected readonly layers = new Map<string, AbstractLayer>();
  protected readonly overlays = new Map<string, AbstractOverlay>();
  protected readonly controls = new Map<string, AbstractControl>();

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

  public get isMounted(): boolean {
    return this.nativeMap !== undefined;
  }

  public get isLoaded(): boolean {
    return this.loaded;
  }

  public async load(): Promise<this> {
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
    if (this.nativeMap) {
      return this;
    }

    if (!this.loaded) {
      throw new Error(
        `Map "${this.id}" must be loaded before mount(). Call await map.load() first.`,
      );
    }

    if (!target) {
      throw new Error(`Map "${this.id}" requires a mount target.`);
    }

    this.nativeMap = this.adapter.createMap(
      { container: target },
      this.getResolvedOptions(target),
      createMapEventBridge(this),
    );

    for (const source of this.sources.values()) {
      this.materializeSource(source);
    }

    for (const layer of this.layers.values()) {
      this.materializeLayer(layer);
    }

    for (const overlay of this.overlays.values()) {
      this.materializeOverlay(overlay);
    }

    for (const control of this.controls.values()) {
      this.materializeControl(control);
    }

    this.fire("mounted", {
      mapId: this.id,
      engine: this.adapter.engine,
    });

    return this;
  }

  public destroy(): this {
    if (!this.nativeMap) {
      return this;
    }

    for (const control of Array.from(this.controls.values()).reverse()) {
      this.dematerializeControl(control);
    }

    for (const overlay of Array.from(this.overlays.values()).reverse()) {
      this.dematerializeOverlay(overlay);
    }

    for (const layer of Array.from(this.layers.values()).reverse()) {
      this.dematerializeLayer(layer);
    }

    for (const source of Array.from(this.sources.values()).reverse()) {
      this.dematerializeSource(source);
    }

    this.adapter.destroyMap(this.nativeMap);
    this.nativeMap = undefined;

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
        `Map "${this.id}" interaction events can only be emitted by an adapter bridge.`,
      );
    }

    return this.fire(type, payload);
  }

  public setView(view: CameraState, transition?: CameraTransition): this {
    if (!this.nativeMap) {
      throw new Error(`Map "${this.id}" is not mounted.`);
    }

    this.adapter.setView(this.nativeMap, view, transition);
    return this;
  }

  public patchMapOptions(patch: UnifiedMapRuntimeOptions): this {
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
    return this.patchMapOptions({ style });
  }

  public getView(): CameraState {
    if (!this.nativeMap) {
      return this.options.initialView;
    }

    return this.adapter.getView(this.nativeMap);
  }

  public project(lngLat: LngLatLike): ScreenPoint {
    if (!this.nativeMap) {
      throw new Error(`Map "${this.id}" is not mounted.`);
    }

    return this.adapter.project(this.nativeMap, lngLat);
  }

  public unproject(point: ScreenPoint): LngLatLiteral {
    if (!this.nativeMap) {
      throw new Error(`Map "${this.id}" is not mounted.`);
    }

    return this.adapter.unproject(this.nativeMap, point);
  }

  public addSource<TSource extends AbstractSource>(source: TSource): TSource {
    this.ensureUnique(this.sources, source.id, "source");
    bindManagedEntity(source, this);
    this.sources.set(source.id, source);
    this.bindSource(source);

    if (this.nativeMap) {
      this.materializeSource(source);
    }

    this.fire("sourceAdded", { sourceId: source.id });
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
    this.fire("sourceRemoved", { sourceId });
    return this;
  }

  public addLayer<TLayer extends AbstractLayer>(layer: TLayer): TLayer {
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

    this.fire("layerAdded", { layerId: layer.id });
    return layer;
  }

  public getLayer<TLayer extends AbstractLayer>(
    layerId: string,
  ): TLayer | undefined {
    return this.layers.get(layerId) as TLayer | undefined;
  }

  public removeLayer(layerId: string): this {
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
    this.fire("layerRemoved", { layerId });
    return this;
  }

  public addOverlay<TOverlay extends AbstractOverlay>(overlay: TOverlay): TOverlay {
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

    this.fire("overlayAdded", { overlayId: overlay.id });
    return overlay;
  }

  public getOverlay<TOverlay extends AbstractOverlay>(
    overlayId: string,
  ): TOverlay | undefined {
    return this.overlays.get(overlayId) as TOverlay | undefined;
  }

  public removeOverlay(overlayId: string): this {
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
    this.fire("overlayRemoved", { overlayId });
    return this;
  }

  public addControl<TControl extends AbstractControl>(control: TControl): TControl {
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

    this.fire("controlAdded", { controlId: control.id });
    return control;
  }

  public getControl<TControl extends AbstractControl>(
    controlId: string,
  ): TControl | undefined {
    return this.controls.get(controlId) as TControl | undefined;
  }

  public removeControl(controlId: string): this {
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
    this.fire("controlRemoved", { controlId });
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

  private dematerializeSource(source: AbstractSource): void {
    if (!this.nativeMap || !source.isMounted()) {
      return;
    }

    this.adapter.unmountSource(this.nativeMap, source, source.getNativeHandle());
    unmountManagedEntity(source);
  }

  private materializeLayer(layer: AbstractLayer): void {
    if (!this.nativeMap || layer.isMounted()) {
      return;
    }

    const handle = this.adapter.mountLayer(this.nativeMap, layer);
    mountManagedEntity(layer, this, handle);
  }

  private dematerializeLayer(layer: AbstractLayer): void {
    if (!this.nativeMap || !layer.isMounted()) {
      return;
    }

    this.adapter.unmountLayer(this.nativeMap, layer, layer.getNativeHandle());
    unmountManagedEntity(layer);
  }

  private materializeOverlay(overlay: AbstractOverlay): void {
    if (!this.nativeMap || overlay.isMounted()) {
      return;
    }

    this.assertOverlayCapabilities(overlay);

    const handle = this.adapter.mountOverlay(this.nativeMap, overlay);
    mountManagedEntity(overlay, this, handle);
  }

  private dematerializeOverlay(overlay: AbstractOverlay): void {
    if (!this.nativeMap || !overlay.isMounted()) {
      return;
    }

    this.adapter.unmountOverlay(
      this.nativeMap,
      overlay,
      overlay.getNativeHandle(),
    );
    unmountManagedEntity(overlay);
  }

  private materializeControl(control: AbstractControl): void {
    if (!this.nativeMap || control.isMounted()) {
      return;
    }

    this.assertControlCapabilities(control);

    const handle = this.adapter.mountControl(this.nativeMap, control);
    mountManagedEntity(control, this, handle);
  }

  private dematerializeControl(control: AbstractControl): void {
    if (!this.nativeMap || !control.isMounted()) {
      return;
    }

    this.adapter.unmountControl(
      this.nativeMap,
      control,
      control.getNativeHandle(),
    );
    unmountManagedEntity(control);
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

  private getResolvedOptions(target = this.options.target): UnifiedMapOptions {
    return {
      ...this.options,
      ...this.runtimeOptions,
      target,
    };
  }

}
