import type {AbstractLayer} from "./layer";
import type {AbstractMap} from "./map";
import type {AbstractControl} from "./control";
import type {AbstractOverlay} from "./overlay";
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
import type {ControlDefinition, OverlayDefinition} from "./types";

export interface MapEventBridge {
	emit<K extends EventType<MapAdapterEvent>>(
		type: K,
		payload?: EventPayload<MapAdapterEvent, K>,
	): void;
}

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

export function createOverlayEventBridge<
	TOptions extends object,
	TDefinition extends OverlayDefinition = OverlayDefinition,
	TExtraEvents extends EventMapBase = EmptyEventMap,
>(
	overlay: AbstractOverlay<TOptions, TDefinition, TExtraEvents>,
): AdapterEventEmitter<AppendEvents<OverlayInteractionEvent, TExtraEvents>> {
	return {
		emit: (type, payload) => {
			overlay[adapterEventEmitterSymbol](type, payload);
		},
	};
}

export function createControlEventBridge<
	TOptions extends object,
	TDefinition extends ControlDefinition = ControlDefinition,
	TExtraEvents extends EventMapBase = EventMapBase,
>(
	control: AbstractControl<TOptions, TDefinition, TExtraEvents>,
): AdapterEventEmitter<TExtraEvents> {
	return {
		emit: (type, payload) => {
			control[adapterEventEmitterSymbol](type, payload);
		},
	};
}
