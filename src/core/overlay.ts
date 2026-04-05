import {AbstractMapEntity} from "./entity";
import type {AppendEvents, EmptyEventMap, EventMapBase, OverlayInteractionEvent,} from "./events";
import type {OverlayDefinition} from "./types";

export interface OverlayOptions {
	visible?: boolean;

	zIndex?: number;

	metadata?: Record<string, unknown>;
}

export abstract class AbstractOverlay<
	TOptions extends OverlayOptions = OverlayOptions,
	TDefinition extends OverlayDefinition = OverlayDefinition,
	TExtraEvents extends EventMapBase = EmptyEventMap,
	TOverlayHandle = unknown,
> extends AbstractMapEntity<
	TOptions,
	TOverlayHandle,
	AppendEvents<OverlayInteractionEvent, TExtraEvents>
> {
	public abstract readonly kind: TDefinition["kind"];

	public abstract toOverlayDefinition(): TDefinition;
}
