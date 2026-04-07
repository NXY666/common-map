import type {EmptyEventUnion} from "@/core/events";
import {AbstractPathOverlay} from "./path";
import type {PolygonOverlayDefinition, PolygonOverlayOptions, PolygonStyle,} from "./types";

export abstract class AbstractPolygonOverlay<
	TOptions extends PolygonOverlayOptions = PolygonOverlayOptions,
	TOverlayHandle = unknown,
> extends AbstractPathOverlay<
	TOptions,
	PolygonOverlayDefinition,
	EmptyEventUnion,
	TOverlayHandle
> {
	public readonly kind = "polygon" as const;

	public readonly meta = {
		renderLayer: "vector-overlay",
		interactionLayer: "engine",
		description:
			"一个按地理坐标绘制的闭合区域对象，用于少量、强交互的业务区域。",
	} as const;

	public setStyle(style: Partial<PolygonStyle>): this {
		this.setOptions("style", {
			...this.options.style,
			...style,
		});
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
