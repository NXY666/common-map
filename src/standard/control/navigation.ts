import type {EmptyEventUnion} from "@/core/events";
import {AbstractStandardControl} from "./base";
import type {NavigationControlDefinition, NavigationControlOptions,} from "./types";

export abstract class AbstractNavigationControl<
	TOptions extends NavigationControlOptions = NavigationControlOptions,
	TControlHandle = unknown,
> extends AbstractStandardControl<
	TOptions,
	NavigationControlDefinition,
	EmptyEventUnion,
	TControlHandle
> {
	public readonly kind = "navigation" as const;

	public readonly meta = {
		renderLayer: "control-dom",
		interactionLayer: "dom",
		description:
			"一个负责缩放、罗盘和视角复位的地图操作控件集合，是默认导航控件。",
	} as const;

	public setShowZoom(showZoom: boolean): this {
		this.setOptions("showZoom", showZoom);
		return this;
	}

	public showZoomButtons(): this {
		return this.setShowZoom(true);
	}

	public hideZoomButtons(): this {
		return this.setShowZoom(false);
	}

	public setShowCompass(showCompass: boolean): this {
		this.setOptions("showCompass", showCompass);
		return this;
	}

	public showCompass(): this {
		return this.setShowCompass(true);
	}

	public hideCompass(): this {
		return this.setShowCompass(false);
	}

	public setVisualizePitch(visualizePitch: boolean): this {
		this.setOptions("visualizePitch", visualizePitch);
		return this;
	}

	public toStandardControlDefinition(): NavigationControlDefinition {
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
