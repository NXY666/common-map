import {AbstractMapEntity} from "./entity";
import type {EmptyEventMap, EventMapBase,} from "./events";
import type {ControlDefinition, ControlSlot, PixelOffset, PixelOffsetLike,} from "./types";

export interface ControlOptions {
	position?: ControlSlot;

	offset?: PixelOffsetLike;

	visible?: boolean;

	metadata?: Record<string, unknown>;
}

export abstract class AbstractControl<
	TOptions extends ControlOptions = ControlOptions,
	TDefinition extends ControlDefinition = ControlDefinition,
	TExtraEvents extends EventMapBase = EmptyEventMap,
	TControlHandle = unknown
> extends AbstractMapEntity<
	TOptions,
	TControlHandle,
	TExtraEvents
> {
	public abstract readonly kind: TDefinition["kind"];

	public abstract get position(): ControlSlot;

	public abstract get offset(): PixelOffset;

	public abstract get visible(): boolean;

	public abstract setVisibility(visible: boolean): this;

	public abstract setPosition(position: ControlSlot): this;

	public abstract setOffset(offset: PixelOffsetLike): this;

	public abstract toControlDefinition(): TDefinition;

	protected abstract getDefaultPosition(): ControlSlot;
}
