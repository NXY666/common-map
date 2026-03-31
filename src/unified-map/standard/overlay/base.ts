import {
  type EmptyEventMap,
  type EventMapBase,
} from "../../core/events";
import type { CapabilityLevel, MapCapability } from "../../core/capability";
import { AbstractOverlay } from "../../core/overlay";
import type { OverlayDefinition } from "../../core/types";
import type { StandardObjectMeta } from "../common/primitives";
import type {
  StandardOverlayDefinition,
  StandardOverlayOptions,
} from "./types";

interface StandardOverlayReservedEventMap extends EventMapBase {
  visibilityChanged: { id: string; visible: boolean };
  zIndexChanged: { id: string; zIndex: number | undefined };
}

export abstract class AbstractStandardOverlay<
  TOptions extends StandardOverlayOptions,
  TDefinition extends StandardOverlayDefinition,
  TExtraEvents extends EventMapBase = EmptyEventMap,
> extends AbstractOverlay<
  TOptions,
  Omit<TExtraEvents, keyof StandardOverlayReservedEventMap>
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

    this.patchOptions({ visible } as Partial<TOptions>);
    this.fire("visibilityChanged", { id: this.id, visible } as never);
    return this;
  }

  public setZIndex(zIndex: number | undefined): this {
    this.patchOptions({ zIndex } as Partial<TOptions>);
    this.fire("zIndexChanged", { id: this.id, zIndex } as never);
    return this;
  }

  public setMinZoom(minZoom: number | undefined): this {
    this.patchOptions({ minZoom } as Partial<TOptions>);
    return this;
  }

  public setMaxZoom(maxZoom: number | undefined): this {
    this.patchOptions({ maxZoom } as Partial<TOptions>);
    return this;
  }

  protected assertCapability(
    capability: MapCapability,
    minimum: CapabilityLevel = "emulated",
  ): void {
    this.managingMap?.adapter.capabilities.assert(capability, minimum);
  }

  public abstract toStandardOverlayDefinition(): TDefinition;

  public override toOverlayDefinition(): OverlayDefinition<TOptions> {
    return this.toStandardOverlayDefinition() as unknown as OverlayDefinition<TOptions>;
  }
}
