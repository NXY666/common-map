import type {EmptyEventUnion} from "@/core/events";
import type {ControlSlot, LengthUnit} from "@/core/types";
import {AbstractStandardControl} from "./base";
import type {ScaleControlDefinition, ScaleControlOptions} from "./types";

export abstract class AbstractScaleControl<
	TOptions extends ScaleControlOptions = ScaleControlOptions,
	TControlHandle = unknown,
> extends AbstractStandardControl<
	TOptions,
	ScaleControlDefinition,
	EmptyEventUnion,
	TControlHandle
> {
	public readonly kind = "scale" as const;

	public readonly meta = {
		renderLayer: "control-dom",
		interactionLayer: "dom",
		description: "一个显示当前地图比例尺的只读控件，可切换单位与长度上限。",
	} as const;

	public setUnit(unit: LengthUnit): this {
		this.setOptions("unit", unit);
		return this;
	}

	public useMetric(): this {
		return this.setUnit("metric");
	}

	public useImperial(): this {
		return this.setUnit("imperial");
	}

	public useNautical(): this {
		return this.setUnit("nautical");
	}

	public setMaxWidth(maxWidth: number | undefined): this {
		this.setOptions("maxWidth", maxWidth);
		return this;
	}

	public toStandardControlDefinition(): ScaleControlDefinition {
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
		return "bottom-left";
	}
}
