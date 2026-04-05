import {AbstractMapEntity} from "./entity";
import type {SourceDataChangedEvent} from "./events";
import type {SourceDefinition} from "./types";

export abstract class AbstractSource<
	TOptions extends object = object,
	TDefinition extends SourceDefinition = SourceDefinition,
	TSourceHandle = unknown,
> extends AbstractMapEntity<
	TOptions,
	TSourceHandle,
	SourceDataChangedEvent<TOptions>
> {
	public abstract readonly kind: TDefinition["kind"];

	public abstract toSourceDefinition(): TDefinition;

	protected notifyDataChanged(reason: string): this {
		this.fire("dataChanged", {
			id: this.id,
			reason,
			options: this.options,
		});
		return this;
	}
}
