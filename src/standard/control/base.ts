import type {CapabilityLevel, MapCapability} from "@/core/capability";
import {AbstractControl} from "@/core/control";
import type {EmptyEventMap, EventMapBase} from "@/core/events";
import type {ControlDefinition, ControlSlot, PixelOffset, PixelOffsetLike,} from "@/core/types";
import {normalizePixelOffset} from "@/standard";
import type {StandardObjectMeta} from "@/standard";
import type {StandardControlDefinition, StandardControlOptions,} from "./types";

interface StandardControlReservedEventMap extends EventMapBase {
  positionChanged: { id: string; position: ControlSlot };
  visibilityChanged: { id: string; visible: boolean };
  offsetChanged: { id: string; offset: PixelOffset };
}

export abstract class AbstractStandardControl<
  TOptions extends StandardControlOptions,
  TDefinition extends StandardControlDefinition,
  TExtraEvents extends EventMapBase = EmptyEventMap,
  TControlHandle = unknown,
> extends AbstractControl<
  TOptions,
  Omit<TExtraEvents, keyof StandardControlReservedEventMap>,
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

    this.patchOptions({ visible } as Partial<TOptions>);
    this.fire("visibilityChanged", { id: this.id, visible } as never);
    return this;
  }

  public setPosition(position: ControlSlot): this {
    this.patchOptions({ position } as Partial<TOptions>);
    this.fire("positionChanged", { id: this.id, position } as never);
    return this;
  }

  public setOffset(offset: PixelOffsetLike): this {
    const next = normalizePixelOffset(offset);
    const current = this.offset;

    if (current.x === next.x && current.y === next.y) {
      return this;
    }

    this.patchOptions({ offset } as Partial<TOptions>);
    this.fire("offsetChanged", { id: this.id, offset: next } as never);
    return this;
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

  public abstract toStandardControlDefinition(): TDefinition;

  public override toControlDefinition(): ControlDefinition<TOptions> {
    return this.toStandardControlDefinition() as unknown as ControlDefinition<TOptions>;
  }
}
