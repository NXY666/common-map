import {AbstractMapEntity} from "./entity";
import type {EmptyEventMap, EventMapBase, OverlayExtraEventMap,} from "./events";
import type {OverlayDefinition, OverlayKind} from "./types";

export interface OverlayOptions {
  visible?: boolean;
  zIndex?: number;
  metadata?: Record<string, unknown>;
}

export abstract class AbstractOverlay<
  TOptions extends OverlayOptions = OverlayOptions,
  TExtraEvents extends EventMapBase = EmptyEventMap,
  TOverlayHandle = unknown,
> extends AbstractMapEntity<
  TOptions,
  TOverlayHandle,
  OverlayExtraEventMap<TOptions> & TExtraEvents
> {
  public abstract readonly kind: OverlayKind;

  public abstract toOverlayDefinition(): OverlayDefinition<TOptions>;
}
