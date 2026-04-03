import {AbstractMapEntity} from "./entity";
import type {ControlExtraEventMap, EmptyEventMap, EventMapBase,} from "./events";
import type {ControlDefinition, ControlKind, ControlSlot, PixelOffset, PixelOffsetLike,} from "./types";

export interface ControlOptions {
  position?: ControlSlot;
  offset?: PixelOffsetLike;
  visible?: boolean;
  metadata?: Record<string, unknown>;
}

export abstract class AbstractControl<
  TOptions extends ControlOptions = ControlOptions,
  TExtraEvents extends EventMapBase = EmptyEventMap,
  TControlHandle = unknown,
> extends AbstractMapEntity<
  TOptions,
  TControlHandle,
  ControlExtraEventMap<TOptions> & TExtraEvents
> {
  public abstract readonly kind: ControlKind;

  public abstract get position(): ControlSlot;

  public abstract get offset(): PixelOffset;

  public abstract get visible(): boolean;

  public abstract setVisibility(visible: boolean): this;

  public abstract setPosition(position: ControlSlot): this;

  public abstract setOffset(offset: PixelOffsetLike): this;

  protected abstract getDefaultPosition(): ControlSlot;

  public abstract toControlDefinition(): ControlDefinition<TOptions>;
}
