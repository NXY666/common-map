import type { Alignment } from "../../core/types";
import { MAP_CAPABILITY_KEYS } from "../../core/capability";
import { AbstractAnchoredOverlay } from "./anchored";
import { AbstractPopupOverlay } from "./popup";
import type {
  MarkerOverlayDefinition,
  MarkerOverlayEventMap,
  MarkerOverlayOptions,
  MarkerVisual,
} from "./types";

export abstract class AbstractMarkerOverlay<
  TOptions extends MarkerOverlayOptions = MarkerOverlayOptions,
> extends AbstractAnchoredOverlay<
  TOptions,
  MarkerOverlayDefinition,
  MarkerOverlayEventMap
> {
  public readonly kind = "marker" as const;
  public readonly meta = {
    renderLayer: "dom-overlay",
    interactionLayer: "dom",
    description:
      "一个有唯一地理锚点的点对象，主要用于少量、高交互、可拖拽、可绑定 popup 的点标注。",
  } as const;

  protected popupRef?: AbstractPopupOverlay;

  public get draggable(): boolean {
    return this.options.draggable ?? false;
  }

  public get popup(): AbstractPopupOverlay | undefined {
    return this.popupRef;
  }

  public setVisual(visual: MarkerVisual | undefined): this {
    this.patchOptions({ visual } as Partial<TOptions>);
    return this;
  }

  public setDraggable(draggable: boolean): this {
    if (draggable) {
      this.assertCapability(MAP_CAPABILITY_KEYS.overlay.markerDrag);
    }

    this.patchOptions({ draggable } as Partial<TOptions>);
    return this;
  }

  public enableDragging(): this {
    return this.setDraggable(true);
  }

  public disableDragging(): this {
    return this.setDraggable(false);
  }

  public setRotation(rotation: number | undefined): this {
    this.patchOptions({ rotation } as Partial<TOptions>);
    return this;
  }

  public setRotationAlignment(alignment: Alignment | undefined): this {
    this.patchOptions({ rotationAlignment: alignment } as Partial<TOptions>);
    return this;
  }

  public setPitchAlignment(alignment: Alignment | undefined): this {
    this.patchOptions({ pitchAlignment: alignment } as Partial<TOptions>);
    return this;
  }

  public bindPopup(popup: AbstractPopupOverlay | null): this {
    const nextPopup = popup ?? undefined;
    const currentPopup = this.popupRef;

    if (currentPopup === nextPopup) {
      return this;
    }

    if (nextPopup) {
      this.assertCapability(MAP_CAPABILITY_KEYS.overlay.markerBindPopup);

      const markerMap = this.managingMap;
      const popupMap = nextPopup.managingMap;

      if (markerMap && popupMap && markerMap !== popupMap) {
        throw new Error(
          `Marker "${this.id}" cannot bind popup "${nextPopup.id}" from another map.`,
        );
      }
    }

    currentPopup?.close();
    this.popupRef = nextPopup;
    this.touch();
    this.fire("popupBindingChanged", {
      id: this.id,
      popupId: nextPopup?.id,
    });
    return this;
  }

  public unbindPopup(): this {
    return this.bindPopup(null);
  }

  public openPopup(): this {
    this.popupRef?.open();
    return this;
  }

  public closePopup(): this {
    this.popupRef?.close();
    return this;
  }

  public togglePopup(): this {
    this.popupRef?.toggle();
    return this;
  }

  public toStandardOverlayDefinition(): MarkerOverlayDefinition {
    return {
      id: this.id,
      kind: this.kind,
      visible: this.visible,
      zIndex: this.zIndex,
      options: this.options,
      metadata: this.options.metadata,
      popupId: this.popupRef?.id,
    };
  }
}
