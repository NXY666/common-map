import type {EmptyEventUnion} from "@/core/events";
import {AbstractPathOverlay} from "./path";
import type {PolylineOverlayDefinition, PolylineOverlayOptions, PolylineStyle,} from "./types";

export abstract class AbstractPolylineOverlay<
	TOptions extends PolylineOverlayOptions = PolylineOverlayOptions,
	TOverlayHandle = unknown,
> extends AbstractPathOverlay<
	TOptions,
	PolylineOverlayDefinition,
	EmptyEventUnion,
	TOverlayHandle
> {
	public readonly kind = "polyline" as const;

	public readonly meta = {
		renderLayer: "vector-overlay",
		interactionLayer: "engine",
		description:
			"一条按地理坐标绘制的路径对象，用于少量、强交互的路线、轨迹、边界线。",
	} as const;

	public setStyle(style: Partial<PolylineStyle>): this {
		this.setOptions("style", {
			...this.options.style,
			...style,
		});
		return this;
	}

	public toStandardOverlayDefinition(): PolylineOverlayDefinition {
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
