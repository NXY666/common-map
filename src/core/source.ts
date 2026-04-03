import {AbstractMapEntity} from "./entity";
import type {SourceExtraEventMap} from "./events";
import type {SourceDefinition, SourceKind} from "./types";

export abstract class AbstractSource<
  TOptions extends object = object,
  TSourceHandle = unknown,
> extends AbstractMapEntity<
  TOptions,
  TSourceHandle,
  SourceExtraEventMap<TOptions>
> {
  public abstract readonly kind: SourceKind;

  public abstract toSourceDefinition(): SourceDefinition<TOptions>;

  protected notifyDataChanged(reason: string): this {
    this.fire("dataChanged", {
      id: this.id,
      reason,
      options: this.options,
    });
    return this;
  }
}
