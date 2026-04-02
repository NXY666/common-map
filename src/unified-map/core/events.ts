import type {
  CameraState,
  ControlSlot,
  LngLatLiteral,
  OverlayKind,
  PixelOffset,
  ScreenPoint,
} from "./types";

export interface Subscription {
  unsubscribe(): void;
}

export type EventMapBase = object;
export type EmptyEventMap = Record<never, never>;

export type EventKey<TEvents extends EventMapBase> = Extract<keyof TEvents, string>;

export type EventPayload<
  TEvents extends EventMapBase,
  TType extends EventKey<TEvents>,
> = TEvents[TType] extends object | undefined ? TEvents[TType] : never;

export type EventEnvelope<
  TType extends string,
  TTarget,
  TPayload extends object | undefined,
> = {
  type: TType;
  target: TTarget;
} & (TPayload extends object ? TPayload : Record<never, never>);

export type EventOf<
  TEvents extends EventMapBase,
  TType extends EventKey<TEvents>,
  TTarget,
> = EventEnvelope<TType, TTarget, EventPayload<TEvents, TType>>;

export type EventListener<
  TType extends string,
  TTarget,
  TPayload extends object | undefined,
> = (event: EventEnvelope<TType, TTarget, TPayload>) => void;

export type LifecycleState = "draft" | "mounted" | "disposed";
export type MouseEventType =
  | "click"
  | "dblclick"
  | "contextmenu"
  | "mousedown"
  | "mouseup"
  | "mousemove"
  | "mouseenter"
  | "mouseleave";
export type TouchEventType =
  | "touchstart"
  | "touchmove"
  | "touchend"
  | "touchcancel";
export type LayerTouchEventType = Exclude<TouchEventType, "touchmove">;
export type OverlayDragEventType = "dragstart" | "drag" | "dragend";
export type ViewChangeReason = "api" | "interaction" | "animation" | "sync";
export type InteractionInputType = "mouse" | "touch" | "keyboard" | "unknown";

export interface InteractionModifiers {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

export interface BaseInteractionPayload {
  originalEvent?: unknown;
  preventDefault?: () => void;
  defaultPrevented?: boolean;
  modifiers: InteractionModifiers;
}

export interface MouseInteractionPayload extends BaseInteractionPayload {
  screenPoint?: ScreenPoint;
  lngLat?: LngLatLiteral;
  button?: number;
  buttons?: number;
}

export interface TouchPointPayload {
  identifier?: number;
  screenPoint: ScreenPoint;
  lngLat?: LngLatLiteral;
}

export interface TouchInteractionPayload extends BaseInteractionPayload {
  screenPoint?: ScreenPoint;
  lngLat?: LngLatLiteral;
  touches: readonly TouchPointPayload[];
  changedTouches?: readonly TouchPointPayload[];
}

export interface LayerFeatureHit {
  featureId?: string | number;
  sourceId?: string;
  layerId?: string;
  geometryType?: string;
  properties?: Readonly<Record<string, unknown>>;
  raw?: unknown;
}

export interface MapEntitySnapshot<TOptions extends object> {
  id: string;
  state: LifecycleState;
  options: Readonly<TOptions>;
}

export interface MapEntityEventMap<TOptions extends object> extends EventMapBase {
  mounted: MapEntitySnapshot<TOptions>;
  updated: MapEntitySnapshot<TOptions> & {
    patch: Partial<TOptions>;
  };
  unmounted: MapEntitySnapshot<TOptions>;
}

export type EntityEventMap<
  TOptions extends object,
  TExtraEvents extends EventMapBase = EmptyEventMap,
> = MapEntityEventMap<TOptions> &
  Omit<TExtraEvents, keyof MapEntityEventMap<TOptions>>;

export interface SourceExtraEventMap<TOptions extends object = object>
  extends EventMapBase {
  dataChanged: {
    id: string;
    reason: string;
    options: Readonly<TOptions>;
  };
}

export type SourceEventMap<TOptions extends object = object> =
  EntityEventMap<TOptions, SourceExtraEventMap<TOptions>>;

interface LayerStateEventMap extends EventMapBase {
  visibilityChanged: {
    id: string;
    visible: boolean;
  };
  zIndexChanged: {
    id: string;
    zIndex: number | undefined;
  };
}

export interface LayerMouseEventPayload extends MouseInteractionPayload {
  id: string;
  features?: readonly LayerFeatureHit[];
}

export interface LayerTouchEventPayload extends TouchInteractionPayload {
  id: string;
  features?: readonly LayerFeatureHit[];
}

export type LayerMouseEventMap = {
  [K in MouseEventType]: LayerMouseEventPayload;
};

export type LayerTouchEventMap = {
  [K in LayerTouchEventType]: LayerTouchEventPayload;
};

export type LayerExtraEventMap<TOptions extends object = object> =
  LayerStateEventMap & LayerMouseEventMap & LayerTouchEventMap;

export type LayerEventMap<TOptions extends object = object> =
  EntityEventMap<TOptions, LayerExtraEventMap<TOptions>>;

interface OverlayStateEventMap extends EventMapBase {
  visibilityChanged: {
    id: string;
    visible: boolean;
  };
  zIndexChanged: {
    id: string;
    zIndex: number | undefined;
  };
}

export interface OverlayMouseEventPayload extends MouseInteractionPayload {
  id: string;
  kind: OverlayKind;
}

export interface OverlayTouchEventPayload extends TouchInteractionPayload {
  id: string;
  kind: OverlayKind;
}

export interface OverlayDragEventPayload extends MouseInteractionPayload {
  id: string;
  kind: OverlayKind;
}

export type OverlayMouseEventMap = {
  [K in MouseEventType]: OverlayMouseEventPayload;
};

export type OverlayTouchEventMap = {
  [K in TouchEventType]: OverlayTouchEventPayload;
};

export type OverlayDragEventMap = {
  [K in OverlayDragEventType]: OverlayDragEventPayload;
};

export type OverlayExtraEventMap<TOptions extends object = object> =
  OverlayStateEventMap &
    OverlayMouseEventMap &
    OverlayTouchEventMap &
    OverlayDragEventMap;

export type OverlayEventMap<TOptions extends object = object> =
  EntityEventMap<TOptions, OverlayExtraEventMap<TOptions>>;

interface ControlStateEventMap extends EventMapBase {
  positionChanged: {
    id: string;
    position: ControlSlot;
  };
  visibilityChanged: {
    id: string;
    visible: boolean;
  };
  offsetChanged: {
    id: string;
    offset: PixelOffset;
  };
}

export type ControlExtraEventMap<TOptions extends object = object> =
  ControlStateEventMap;

export type ControlEventMap<TOptions extends object = object> =
  EntityEventMap<TOptions, ControlExtraEventMap<TOptions>>;

export interface AdapterEventMap extends EventMapBase {
  logged: {
    entry: string;
  };
}

interface MapLifecycleEventMap extends EventMapBase {
  mounted: {
    mapId: string;
    engine: string;
  };
  unmounted: {
    mapId: string;
    engine: string;
  };
  destroyed: {
    mapId: string;
    engine: string;
  };
  error: {
	  mapId: string;
	  operation: "mount" | "unmount" | "destroy";
	  message: string;
	  error: unknown;
	  entityKind?: "map" | "source" | "layer" | "overlay" | "control";
	  entityId?: string;
  };
  // Fires only after the adapter observes an actual camera change.
  viewChanged: {
    mapId: string;
    view: CameraState;
    reason?: ViewChangeReason;
    inputType?: InteractionInputType;
  };
  sourceAdded: {
    sourceId: string;
  };
  sourceRemoved: {
    sourceId: string;
  };
  layerAdded: {
    layerId: string;
  };
  layerRemoved: {
    layerId: string;
  };
  overlayAdded: {
    overlayId: string;
  };
  overlayRemoved: {
    overlayId: string;
  };
  controlAdded: {
    controlId: string;
  };
  controlRemoved: {
    controlId: string;
  };
}

export interface MapKeyboardEventPayload extends BaseInteractionPayload {
  mapId: string;
  key: string;
  code?: string;
  repeat: boolean;
  location?: number;
}

export type MapMouseEventMap = {
  [K in MouseEventType]: MouseInteractionPayload & {
    mapId: string;
  };
};

export type MapTouchEventMap = {
  [K in TouchEventType]: TouchInteractionPayload & {
    mapId: string;
  };
};

export interface MapKeyboardEventMap extends EventMapBase {
  keydown: MapKeyboardEventPayload;
  keyup: MapKeyboardEventPayload;
}

export type MapEventMap = MapLifecycleEventMap &
  MapMouseEventMap &
  MapTouchEventMap &
  MapKeyboardEventMap;

type UntypedListener = (event: object) => void;

function toPayloadObject(payload: object | undefined): object {
  return payload ?? {};
}

export abstract class TypedEvented<TEvents extends EventMapBase> {
  private readonly listeners = new Map<string, Set<UntypedListener>>();
  private readonly oneTimeListeners = new Map<string, Set<UntypedListener>>();

  public on<K extends EventKey<TEvents>>(
    type: K,
    listener: EventListener<K, this, EventPayload<TEvents, K>>,
  ): Subscription {
    const bucket = this.listeners.get(type) ?? new Set<UntypedListener>();
    bucket.add(listener as UntypedListener);
    this.listeners.set(type, bucket);

    return {
      unsubscribe: () => {
        this.off(type, listener);
      },
    };
  }

  public off<K extends EventKey<TEvents>>(
    type: K,
    listener: EventListener<K, this, EventPayload<TEvents, K>>,
  ): this {
    this.listeners.get(type)?.delete(listener as UntypedListener);
    this.oneTimeListeners.get(type)?.delete(listener as UntypedListener);
    return this;
  }

  public once<K extends EventKey<TEvents>>(
    type: K,
    listener: EventListener<K, this, EventPayload<TEvents, K>>,
  ): this;
  public once<K extends EventKey<TEvents>>(
    type: K,
  ): Promise<EventOf<TEvents, K, this>>;
  public once<K extends EventKey<TEvents>>(
    type: K,
    listener?: EventListener<K, this, EventPayload<TEvents, K>>,
  ): this | Promise<EventOf<TEvents, K, this>> {
    if (listener === undefined) {
      return new Promise<EventOf<TEvents, K, this>>((resolve) => {
        this.once(type, resolve);
      });
    }

    const bucket = this.oneTimeListeners.get(type) ?? new Set<UntypedListener>();
    bucket.add(listener as UntypedListener);
    this.oneTimeListeners.set(type, bucket);
    return this;
  }

  public listens<K extends EventKey<TEvents>>(type: K): boolean {
    return (
      (this.listeners.get(type)?.size ?? 0) > 0 ||
      (this.oneTimeListeners.get(type)?.size ?? 0) > 0
    );
  }

  protected fire<K extends EventKey<TEvents>>(
    type: K,
    payload?: EventPayload<TEvents, K>,
  ): this {
    const event = {
      type,
      target: this,
      ...toPayloadObject(payload),
    } as EventOf<TEvents, K, this>;

    const persistent = Array.from(this.listeners.get(type) ?? []);
    for (const listener of persistent) {
      listener(event);
    }

    const oneTime = Array.from(this.oneTimeListeners.get(type) ?? []);
    this.oneTimeListeners.delete(type);
    for (const listener of oneTime) {
      listener(event);
    }

    return this;
  }
}
