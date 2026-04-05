import type {EventMapBase, EventPayload, EventType} from "./events";

export const adapterEventEmitterSymbol: unique symbol = Symbol(
	"adapterEventEmitter",
);

export interface AdapterEventEmitter<TEvents extends EventMapBase> {
	emit<K extends EventType<TEvents>>(
		type: K,
		payload?: EventPayload<TEvents, K>,
	): void;
}
