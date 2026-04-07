import type {CapabilityLevel, MapCapability} from "@/core/capability";
import {AbstractControl} from "@/core/control";
import type {EmptyEventMap, EventMapBase} from "@/core/events";
import type {ControlSlot, PixelOffset, PixelOffsetLike,} from "@/core/types";
import type {StandardObjectMeta} from "@/standard";
import {normalizePixelOffset} from "@/standard";
import type {StandardControlDefinition, StandardControlOptions,} from "./types";

export abstract class AbstractStandardControl<
	TOptions extends StandardControlOptions,
	TDefinition extends StandardControlDefinition,
	TExtraEvents extends EventMapBase = EmptyEventMap,
	TControlHandle = unknown
> extends AbstractControl<
	TOptions,
	TDefinition,
	TExtraEvents,
	TControlHandle
> {
	public abstract readonly kind: TDefinition["kind"];

	public abstract readonly meta: StandardObjectMeta;

	public get position(): ControlSlot {
		return this.options.position ?? this.getDefaultPosition();
	}

	public get visible(): boolean {
		return this.options.visible ?? true;
	}

	public get offset(): PixelOffset {
		return normalizePixelOffset(this.options.offset);
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

	public setPosition(position: ControlSlot): this {
		return this.setOptions("position", position);
	}

	public setOffset(offset: PixelOffsetLike): this {
		const next = normalizePixelOffset(offset);
		const current = this.offset;

		if (current.x === next.x && current.y === next.y) {
			return this;
		}

		return this.setOptions("offset", offset);
	}

	public abstract toStandardControlDefinition(): TDefinition;

	public override toControlDefinition(): TDefinition {
		return this.toStandardControlDefinition();
	}

	protected getDefaultPosition(): ControlSlot {
		return "top-right";
	}

	protected assertCapability(
		capability: MapCapability,
		minimum: CapabilityLevel = "emulated",
	): void {
		this.managingMap?.adapter.capabilities.assert(capability, minimum);
	}
}
