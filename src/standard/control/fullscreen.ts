import {AbstractStandardControl} from "./base";
import {mapCapabilityKeys} from "@/core/capability";
import type {FullscreenControlDefinition, FullscreenControlEvent, FullscreenControlOptions,} from "./types";

export abstract class AbstractFullscreenControl<
	TOptions extends FullscreenControlOptions = FullscreenControlOptions,
	TControlHandle = unknown,
> extends AbstractStandardControl<
	TOptions,
	FullscreenControlDefinition,
	FullscreenControlEvent,
	TControlHandle
> {
	public readonly kind = "fullscreen" as const;

	public readonly meta = {
		renderLayer: "control-dom",
		interactionLayer: "dom",
		description:
			"一个控制地图容器进入或退出全屏状态的状态型控件，表达的是全屏状态，不是一次性按钮。",
	} as const;

	private actualActiveStateValue: boolean;

	protected constructor(id: string, options: TOptions) {
		super(id, options);
		this.actualActiveStateValue = false;

		this.on("entered", () => {
			this.actualActiveStateValue = true;
		});

		this.on("exited", () => {
			this.actualActiveStateValue = false;
		});

		this.on("unmounted", () => {
			this.actualActiveStateValue = false;
		});
	}

	public get active(): boolean {
		return this.options.active ?? false;
	}

	public get actualActive(): boolean {
		return this.actualActiveStateValue;
	}

	public setActive(active: boolean): this {
		if (active) {
			this.assertCapability(mapCapabilityKeys.control.fullscreenActive);
		}

		if (active === this.active) {
			return this;
		}

		return this.setOptions("active", active);
	}

	public enter(): this {
		return this.setActive(true);
	}

	public exit(): this {
		return this.setActive(false);
	}

	public toggle(): this {
		return this.setActive(!this.active);
	}

	public isActive(): boolean {
		return this.actualActiveStateValue;
	}

	public toStandardControlDefinition(): FullscreenControlDefinition {
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
