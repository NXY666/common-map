import type {EmptyEventUnion} from "@/core/events";
import type {ControlSlot} from "@/core/types";
import {AbstractStandardControl} from "./base";
import type {AttributionControlDefinition, AttributionControlOptions,} from "./types";

export abstract class AbstractAttributionControl<
	TOptions extends AttributionControlOptions = AttributionControlOptions,
	TControlHandle = unknown,
> extends AbstractStandardControl<
	TOptions,
	AttributionControlDefinition,
	EmptyEventUnion,
	TControlHandle
> {
	public readonly kind = "attribution" as const;

	public readonly meta = {
		renderLayer: "control-dom",
		interactionLayer: "dom",
		description:
			"一个展示地图与数据来源署名的只读信息控件，可附加自定义 attribution。",
	} as const;

	public setCompact(compact: boolean): this {
		this.patchOptions({compact} as Partial<TOptions>);
		return this;
	}

	public setCustomAttribution(
		customAttribution: string | readonly string[] | undefined,
	): this {
		this.patchOptions({customAttribution} as Partial<TOptions>);
		return this;
	}

	public clearCustomAttribution(): this {
		return this.setCustomAttribution(undefined);
	}

	public toStandardControlDefinition(): AttributionControlDefinition {
		return {
			id: this.id,
			kind: this.kind,
			position: this.position,
			visible: this.visible,
			options: this.options,
			metadata: this.options.metadata,
		};
	}

	protected override getDefaultPosition(): ControlSlot {
		return "bottom-right";
	}
}
