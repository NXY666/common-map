import type {CameraState, LngLatLiteral, OverlayKind, ScreenPoint,} from "./types";

export interface Subscription {
	unsubscribe(): void;
}

export type EventMapBase = Record<string, object>;

export interface EventBase {
	type: string;
}

export type EmptyEventMap = Record<never, never>;
export type EmptyEventUnion = EmptyEventMap;

export type EventUnionFromMap<TMap extends EventMapBase> = {
	[K in keyof TMap & string]: { type: K } & TMap[K];
}[keyof TMap & string];

export type EventMapFromUnion<TEvents extends EventBase> = {
	[K in TEvents extends { type: infer TType extends string } ? TType : never]:
	Omit<Extract<TEvents, { type: K }>, "type">;
};

type NormalizedEventMap<TEvents extends EventMapBase | EventBase> =
	TEvents extends EventBase ? EventMapFromUnion<TEvents> : TEvents;

export type EventType<TEvents extends EventMapBase | EventBase> =
	keyof NormalizedEventMap<TEvents> & string;

type AssertNoOverlap<
	TBase extends EventMapBase,
	TExtra extends EventMapBase,
> = Extract<keyof TBase, keyof TExtra> extends never ? TExtra : never;

export type AppendEvents<
	TBase extends EventMapBase,
	TExtra extends EventMapBase = EmptyEventMap,
> = TBase & AssertNoOverlap<TBase, TExtra>;

export type EventPayload<
	TEvents extends EventMapBase | EventBase,
	TType extends EventType<TEvents>,
> = NormalizedEventMap<TEvents>[TType];

export type EventOf<
	TEvents extends EventMapBase | EventBase,
	TType extends EventType<TEvents>,
	TTarget,
> = {
	type: TType;
	target: TTarget;
} & EventPayload<TEvents, TType>;

export type EventListener<
	TEvents extends EventMapBase | EventBase,
	TType extends EventType<TEvents>,
	TTarget,
> = (event: EventOf<TEvents, TType, TTarget>) => void;

export type EventVariants<
	TType extends string,
	TPayload extends object,
> = {
	[K in TType]: TPayload;
};

export type LifecycleState = "draft" | "mounted" | "disposed";

export type PointerEventType =
	| "click"
	| "dblclick"
	| "contextmenu"
	| "pointerdown"
	| "pointerup"
	| "pointermove"
	| "pointerenter"
	| "pointerleave";

export type KeyboardEventType = "keydown" | "keyup";
export type OverlayDragEventType = "dragstart" | "drag" | "dragend";
export type ViewChangeReason = "api" | "interaction" | "animation" | "sync";
export type InteractionInputType =
	| "mouse"
	| "touch"
	| "pen"
	| "keyboard"
	| "unknown";

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

	inputType?: InteractionInputType;
}

export interface PointerInteractionPayload extends BaseInteractionPayload {
	screenPoint?: ScreenPoint;

	lngLat?: LngLatLiteral;

	button?: number;

	buttons?: number;

	touches?: readonly TouchPointPayload[];

	changedTouches?: readonly TouchPointPayload[];
}

export interface TouchPointPayload {
	identifier?: number;

	screenPoint: ScreenPoint;

	lngLat?: LngLatLiteral;
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

export type EntityLifecycleEvent<TOptions extends object> = {
	mounted: MapEntitySnapshot<TOptions>;
	updated: MapEntitySnapshot<TOptions> & {
		patch: Partial<TOptions>;
	};
	unmounted: MapEntitySnapshot<TOptions>;
};

export type EntityEvent<
	TOptions extends object,
	TExtraEvents extends EventMapBase = EmptyEventMap,
> = AppendEvents<EntityLifecycleEvent<TOptions>, TExtraEvents>;

export type SourceDataChangedEvent<TOptions extends object = object> = {
	dataChanged: {
		id: string;
		reason: string;
		options: Readonly<TOptions>;
	};
};

export type SourceEvent<TOptions extends object = object> = EntityEvent<
	TOptions,
	SourceDataChangedEvent<TOptions>
>;

export interface MapPointerInteractionPayload extends PointerInteractionPayload {
	mapId: string;
}

export interface LayerPointerInteractionPayload
	extends PointerInteractionPayload {
	id: string;

	features?: readonly LayerFeatureHit[];
}

export interface OverlayPointerInteractionPayload
	extends PointerInteractionPayload {
	id: string;

	kind: OverlayKind;
}

export interface OverlayDragInteractionPayload
	extends PointerInteractionPayload {
	id: string;

	kind: OverlayKind;
}

export interface MapKeyboardEventPayload extends BaseInteractionPayload {
	mapId: string;

	key: string;

	code?: string;

	repeat: boolean;

	location?: number;
}

export type MapInteractionEvent = AppendEvents<
	EventVariants<PointerEventType, MapPointerInteractionPayload>,
	EventVariants<KeyboardEventType, MapKeyboardEventPayload>
>;

export type LayerInteractionEvent = EventVariants<
	PointerEventType,
	LayerPointerInteractionPayload
>;

export type OverlayInteractionEvent = AppendEvents<
	EventVariants<PointerEventType, OverlayPointerInteractionPayload>,
	EventVariants<OverlayDragEventType, OverlayDragInteractionPayload>
>;

export type LayerEvent<TOptions extends object = object> = EntityEvent<
	TOptions,
	LayerInteractionEvent
>;

export type OverlayEvent<
	TOptions extends object = object,
	TCustomEvents extends EventMapBase = EmptyEventMap,
> = EntityEvent<TOptions, AppendEvents<OverlayInteractionEvent, TCustomEvents>>;

export type ControlEvent<
	TOptions extends object = object,
	TCustomEvents extends EventMapBase = EmptyEventMap,
> = EntityEvent<TOptions, TCustomEvents>;

export type AdapterLoggedEvent = {
	logged: {
		entry: string;
	};
};

export type AdapterEvent = AdapterLoggedEvent;

export type MapLifecycleEvent = {
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
	viewChanged: {
		mapId: string;
		view: CameraState;
		reason?: ViewChangeReason;
		inputType?: InteractionInputType;
	};
};

export type MapEvent = AppendEvents<MapLifecycleEvent, MapInteractionEvent>;

export type MapAdapterEvent = Omit<
	MapEvent,
	"mounted" | "unmounted" | "destroyed" | "error"
>;

type UntypedListener = (event: object) => void;

export abstract class TypedEvented<TEvents extends EventMapBase | EventBase> {
	private readonly listeners = new Map<string, Set<UntypedListener>>();

	private readonly oneTimeListeners = new Map<string, Set<UntypedListener>>();

	public on<K extends EventType<TEvents>>(
		type: K,
		listener: EventListener<TEvents, K, this>,
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

	public off<K extends EventType<TEvents>>(
		type: K,
		listener: EventListener<TEvents, K, this>,
	): this {
		this.listeners.get(type)?.delete(listener as UntypedListener);
		this.oneTimeListeners.get(type)?.delete(listener as UntypedListener);
		return this;
	}

	public once<K extends EventType<TEvents>>(
		type: K,
		listener: EventListener<TEvents, K, this>,
	): this;
	public once<K extends EventType<TEvents>>(
		type: K,
	): Promise<EventOf<TEvents, K, this>>;
	public once<K extends EventType<TEvents>>(
		type: K,
		listener?: EventListener<TEvents, K, this>,
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

	public listens<K extends EventType<TEvents>>(type: K): boolean {
		return (
			(this.listeners.get(type)?.size ?? 0) > 0 ||
			(this.oneTimeListeners.get(type)?.size ?? 0) > 0
		);
	}

	protected fire<K extends EventType<TEvents>>(
		type: K,
		payload?: EventPayload<TEvents, K>,
	): this {
		const event = {
			type,
			target: this,
			...(payload ?? {}),
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
