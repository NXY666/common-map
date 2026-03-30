import { AbstractCapabilityProfile } from "./capability";
import { TypedEvented, type AdapterEventMap } from "./events";
import type { AbstractControl } from "./control";
import type { AbstractLayer } from "./layer";
import type { AbstractOverlay } from "./overlay";
import type { AbstractSource } from "./source";
import type { MapEventBridge } from "./internal-events";
import type {
  CameraState,
  CameraTransition,
  LngLatLike,
  LngLatLiteral,
  MapMountTarget,
  ScreenPoint,
  UnifiedMapOptions,
  UnifiedMapRuntimeOptions,
} from "./types";

export abstract class AbstractMapAdapter extends TypedEvented<AdapterEventMap> {
  protected readonly operationLog: string[] = [];

  protected constructor(public readonly capabilities: AbstractCapabilityProfile) {
    super();
  }

  public abstract readonly engine: string;

  public getOperationLog(): readonly string[] {
    return this.operationLog;
  }

  public async load(): Promise<void> {}

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
  ): unknown;

  public abstract destroyMap(mapHandle: unknown): void;

  // setView() only requests a camera change.
  // Adapters must emit viewChanged through the bridge after the native map
  // observes the actual camera state change.
  public abstract setView(
    mapHandle: unknown,
    view: CameraState,
    transition?: CameraTransition,
  ): void;

  public abstract getView(mapHandle: unknown): CameraState;

  public abstract updateMapOptions(
    mapHandle: unknown,
    nextOptions: Readonly<UnifiedMapRuntimeOptions>,
    previousOptions: Readonly<UnifiedMapRuntimeOptions>,
  ): void;

  public abstract project(
    mapHandle: unknown,
    lngLat: LngLatLike,
  ): ScreenPoint;

  public abstract unproject(
    mapHandle: unknown,
    point: ScreenPoint,
  ): LngLatLiteral;

  public abstract mountSource(
    mapHandle: unknown,
    source: AbstractSource,
  ): unknown;

  public abstract updateSource(
    mapHandle: unknown,
    source: AbstractSource,
    sourceHandle: unknown,
  ): void;

  public abstract unmountSource(
    mapHandle: unknown,
    source: AbstractSource,
    sourceHandle: unknown,
  ): void;

  public abstract mountLayer(
    mapHandle: unknown,
    layer: AbstractLayer,
  ): unknown;

  public abstract updateLayer(
    mapHandle: unknown,
    layer: AbstractLayer,
    layerHandle: unknown,
  ): void;

  public abstract unmountLayer(
    mapHandle: unknown,
    layer: AbstractLayer,
    layerHandle: unknown,
  ): void;

  public abstract mountOverlay(
    mapHandle: unknown,
    overlay: AbstractOverlay,
  ): unknown;

  public abstract updateOverlay(
    mapHandle: unknown,
    overlay: AbstractOverlay,
    overlayHandle: unknown,
  ): void;

  public abstract unmountOverlay(
    mapHandle: unknown,
    overlay: AbstractOverlay,
    overlayHandle: unknown,
  ): void;

  public abstract mountControl(
    mapHandle: unknown,
    control: AbstractControl,
  ): unknown;

  public abstract updateControl(
    mapHandle: unknown,
    control: AbstractControl,
    controlHandle: unknown,
  ): void;

  public abstract unmountControl(
    mapHandle: unknown,
    control: AbstractControl,
    controlHandle: unknown,
  ): void;

  protected record(entry: string): void {
    this.operationLog.push(entry);
    this.fire("logged", { entry });
  }
}
