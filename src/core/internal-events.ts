import type {AbstractLayer} from "./layer";
import type {AbstractMap} from "./map";
import type {AdapterEventEmitter} from "./internal-event-bridge";
import {adapterEventEmitterSymbol} from "./internal-event-bridge";
import type {
	AppendEvents,
	EmptyEventMap,
	EventMapBase,
	EventPayload,
	EventType,
	LayerInteractionEvent,
	MapAdapterEvent,
	OverlayInteractionEvent,
} from "./events";

interface OverlayBridgeTarget<TExtraEvents extends EventMapBase> {
	[adapterEventEmitterSymbol]<
		K extends EventType<AppendEvents<OverlayInteractionEvent, TExtraEvents>>
	>(
		type: K,
		payload?: EventPayload<AppendEvents<OverlayInteractionEvent, TExtraEvents>, K>,
	): unknown;
}

interface ControlBridgeTarget<TExtraEvents extends EventMapBase> {
	[adapterEventEmitterSymbol]<
		K extends EventType<TExtraEvents>
	>(
		type: K,
		payload?: EventPayload<TExtraEvents, K>,
	): unknown;
}

export interface MapEventBridge {
	emit<K extends EventType<MapAdapterEvent>>(
		type: K,
		payload?: EventPayload<MapAdapterEvent, K>,
	): void;
}

// 桥接器仅负责事件转发
export function createMapEventBridge(map: AbstractMap): MapEventBridge {
	return {
		emit: (type, payload) => {
			map[adapterEventEmitterSymbol](type, payload);
		},
	};
}

export function createLayerEventBridge(
	layer: AbstractLayer,
): AdapterEventEmitter<LayerInteractionEvent> {
	return {
		emit: (type, payload) => {
			layer[adapterEventEmitterSymbol](type, payload);
		},
	};
}

export function createOverlayEventBridge<TExtraEvents extends EventMapBase = EmptyEventMap>(
	overlay: OverlayBridgeTarget<TExtraEvents>,
): AdapterEventEmitter<AppendEvents<OverlayInteractionEvent, TExtraEvents>> {
	return {
		emit: (type, payload) => {
			overlay[adapterEventEmitterSymbol](type, payload);
		},
	};
}

export function createControlEventBridge<TExtraEvents extends EventMapBase = EventMapBase>(
	control: ControlBridgeTarget<TExtraEvents>,
): AdapterEventEmitter<TExtraEvents> {
	return {
		emit: (type, payload) => {
			control[adapterEventEmitterSymbol](type, payload);
		},
	};
}
