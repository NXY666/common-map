import { AbstractPathOverlay } from "./path";
import type {
  PolygonOverlayDefinition,
  PolygonOverlayOptions,
  PolygonStyle,
} from "./types";

export abstract class AbstractPolygonOverlay<
  TOptions extends PolygonOverlayOptions = PolygonOverlayOptions,
> extends AbstractPathOverlay<TOptions, PolygonOverlayDefinition> {
  public readonly kind = "polygon" as const;
  public readonly meta = {
    renderLayer: "vector-overlay",
    interactionLayer: "engine",
    description:
      "一个按地理坐标绘制的闭合区域对象，用于少量、强交互的业务区域。",
  } as const;

  public setStyle(style: Partial<PolygonStyle>): this {
    this.patchOptions({
      style: {
        ...this.options.style,
        ...style,
      },
    } as Partial<TOptions>);
    return this;
  }

  public toStandardOverlayDefinition(): PolygonOverlayDefinition {
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
