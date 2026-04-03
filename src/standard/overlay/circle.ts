import {AbstractAnchoredOverlay} from "./anchored";
import type {CircleOverlayDefinition, CircleOverlayEventMap, CircleOverlayOptions, CircleStyle,} from "./types";

export abstract class AbstractCircleOverlay<
  TOptions extends CircleOverlayOptions = CircleOverlayOptions,
  TOverlayHandle = unknown,
> extends AbstractAnchoredOverlay<
  TOptions,
  CircleOverlayDefinition,
  CircleOverlayEventMap,
  TOverlayHandle
> {
  public readonly kind = "circle" as const;
  public readonly meta = {
    renderLayer: "vector-overlay",
    interactionLayer: "engine",
    description:
      "一个以地理中心点和米制半径定义的区域对象，用于缓冲区、覆盖半径、搜索圈。",
  } as const;

  public get radius(): number {
    return this.options.radius;
  }

  public setRadius(radius: number): this {
    if (!Number.isFinite(radius) || radius < 0) {
      throw new RangeError(
        `Circle radius must be a finite number greater than or equal to 0, got ${radius}.`,
      );
    }

    if (radius === this.radius) {
      return this;
    }

    this.patchOptions({ radius } as Partial<TOptions>);
    this.fire("radiusChanged", { id: this.id, radius });
    return this;
  }

  public setStyle(style: Partial<CircleStyle>): this {
    this.patchOptions({
      style: {
        ...this.options.style,
        ...style,
      },
    } as Partial<TOptions>);
    return this;
  }

  public toStandardOverlayDefinition(): CircleOverlayDefinition {
    return {
      id: this.id,
      kind: this.kind,
      visible: this.visible,
      zIndex: this.zIndex,
      options: this.options,
      metadata: this.options.metadata,
    };
  }
}
