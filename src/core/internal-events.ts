import type {AbstractLayer} from "./layer";
import type {AbstractMap} from "./map";
import type {AbstractControl} from "./control";
import type {AbstractOverlay} from "./overlay";
import type {
	ControlExtraEventMap,
	EntityEventMap,
	EventKey,
	EventMapBase,
	EventPayload,
	LayerEventMap,
	MapEventMap,
	OverlayExtraEventMap,
} from "./events";

declare const adapterEventAccessBrand: unique symbol;

export interface AdapterEventAccess {
  readonly [adapterEventAccessBrand]: true;
}

export interface MapEventBridge {
  emit<K extends EventKey<MapEventMap>>(
    type: K,
    payload?: EventPayload<MapEventMap, K>,
  ): void;
}

const adapterEventAccess = {} as AdapterEventAccess;

export function hasAdapterEventAccess(
  access: unknown,
): access is AdapterEventAccess {
  return access === adapterEventAccess;
}

export function createMapEventBridge(map: AbstractMap): MapEventBridge {
  return {
    emit: (type, payload) => {
      map.emitFromAdapter(type, payload, adapterEventAccess);
    },
  };
}

export function emitLayerEvent<K extends EventKey<LayerEventMap>>(
  layer: AbstractLayer,
  type: K,
  payload?: EventPayload<LayerEventMap, K>,
): void {
  layer.emitFromAdapter(type, payload, adapterEventAccess);
}

export function emitOverlayEvent<
  TOptions extends object,
  TExtraEvents extends EventMapBase,
  TType extends EventKey<
    EntityEventMap<
      TOptions,
      OverlayExtraEventMap<TOptions> & TExtraEvents
    >
  >,
>(
  overlay: AbstractOverlay<TOptions, TExtraEvents>,
  type: TType,
  payload?: EventPayload<
    EntityEventMap<
      TOptions,
      OverlayExtraEventMap<TOptions> & TExtraEvents
    >,
    TType
  >,
): void {
  overlay.emitFromAdapter(type, payload, adapterEventAccess);
}

export function emitControlEvent<
  TOptions extends object,
  TExtraEvents extends EventMapBase,
  TType extends EventKey<
    EntityEventMap<
      TOptions,
      ControlExtraEventMap<TOptions> & TExtraEvents
    >
  >,
>(
  control: AbstractControl<TOptions, TExtraEvents>,
  type: TType,
  payload?: EventPayload<
    EntityEventMap<
      TOptions,
      ControlExtraEventMap<TOptions> & TExtraEvents
    >,
    TType
  >,
): void {
  control.emitFromAdapter(type, payload, adapterEventAccess);
}
