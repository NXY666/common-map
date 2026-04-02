import type { EmptyEventMap } from "../../core/events";
import type { ControlSlot, LengthUnit } from "../../core/types";
import { AbstractStandardControl } from "./base";
import type { ScaleControlDefinition, ScaleControlOptions } from "./types";

export abstract class AbstractScaleControl<
  TOptions extends ScaleControlOptions = ScaleControlOptions,
  TControlHandle = unknown,
> extends AbstractStandardControl<
  TOptions,
  ScaleControlDefinition,
  EmptyEventMap,
  TControlHandle
> {
  public readonly kind = "scale" as const;
  public readonly meta = {
    renderLayer: "control-dom",
    interactionLayer: "dom",
    description: "一个显示当前地图比例尺的只读控件，可切换单位与长度上限。",
  } as const;

  protected override getDefaultPosition(): ControlSlot {
    return "bottom-left";
  }

  public setUnit(unit: LengthUnit): this {
    this.patchOptions({ unit } as Partial<TOptions>);
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
    this.patchOptions({ maxWidth } as Partial<TOptions>);
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
}
