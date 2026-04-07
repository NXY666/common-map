import type {CapabilityLevel, MapCapability} from "@/core/capability";
import type {EmptyEventMap, EventMapBase} from "@/core/events";
import {AbstractOverlay} from "@/core/overlay";
import type {StandardObjectMeta} from "@/standard";
import type {StandardOverlayDefinition, StandardOverlayOptions,} from "./types";

export abstract class AbstractStandardOverlay<
	TOptions extends StandardOverlayOptions,
	TDefinition extends StandardOverlayDefinition,
	TExtraEvents extends EventMapBase = EmptyEventMap,
	TOverlayHandle = unknown,
> extends AbstractOverlay<
	TOptions,
	TDefinition,
	TExtraEvents,
	TOverlayHandle
> {
	public abstract readonly kind: TDefinition["kind"];

	public abstract readonly meta: StandardObjectMeta;

	public get visible(): boolean {
		return this.options.visible ?? true;
	}

	public get zIndex(): number | undefined {
		return this.options.zIndex;
	}

	public get minZoom(): number | undefined {
		return this.options.minZoom;
	}

	public get maxZoom(): number | undefined {
		return this.options.maxZoom;
	}

	public show(): this {
		return this.setVisibility(true);
	}

	public hide(): this {
		return this.setVisibility(false);
	}

	public toggleVisibility(): this {
		return this.setVisibility(!this.visible);
	}

	public setVisibility(visible: boolean): this {
		if (visible === this.visible) {
			return this;
		}

		return this.setOptions("visible", visible);
	}

	public setZIndex(zIndex: number | undefined): this {
		return this.setOptions("zIndex", zIndex);
	}

	public setMinZoom(minZoom: number | undefined): this {
		this.setOptions("minZoom", minZoom);
		return this;
	}

	public setMaxZoom(maxZoom: number | undefined): this {
		this.setOptions("maxZoom", maxZoom);
		return this;
	}

	public abstract toStandardOverlayDefinition(): TDefinition;

	public override toOverlayDefinition(): TDefinition {
		return this.toStandardOverlayDefinition();
	}

	protected assertCapability(
		capability: MapCapability,
		minimum: CapabilityLevel = "emulated",
	): void {
		this.managingMap?.adapter.capabilities.assert(capability, minimum);
	}
}
