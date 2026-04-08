import type {EmptyEventMap} from "@/core/events";
import {AbstractAnchoredOverlay} from "./anchored";
import type {CircleOverlayDefinition, CircleOverlayOptions, CircleStyle,} from "./types";

export abstract class AbstractCircleOverlay<
	TOptions extends CircleOverlayOptions = CircleOverlayOptions,
	TOverlayHandle = unknown,
> extends AbstractAnchoredOverlay<
	TOptions,
	CircleOverlayDefinition,
	EmptyEventMap,
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

		return this.setOptions("radius", radius);
	}

	public setStyle(style: Partial<CircleStyle>): this {
		this.setOptions("style", {
			...this.options.style,
			...style,
		});
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
