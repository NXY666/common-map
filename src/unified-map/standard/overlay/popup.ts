import { AbstractAnchoredOverlay } from "./anchored";
import { MAP_CAPABILITY_KEYS } from "../../core/capability";
import type {
  PopupContentLike,
  PopupOverlayDefinition,
  PopupOverlayEventMap,
  PopupOverlayOptions,
} from "./types";

export abstract class AbstractPopupOverlay<
  TOptions extends PopupOverlayOptions = PopupOverlayOptions,
> extends AbstractAnchoredOverlay<
  TOptions,
  PopupOverlayDefinition,
  PopupOverlayEventMap
> {
  private actualOpenStateValue: boolean;

  public readonly kind = "popup" as const;
  public readonly meta = {
    renderLayer: "dom-overlay",
    interactionLayer: "dom",
    description:
      "一个锚定到地理坐标或 marker 的浮动信息气泡，用于展示短内容、动作入口和临时详情。",
  } as const;

  protected constructor(id: string, options: TOptions) {
    super(id, options);
    this.actualOpenStateValue = false;

    this.on("opened", () => {
      this.actualOpenStateValue = true;
    });

    this.on("closed", () => {
      this.actualOpenStateValue = false;
    });
  }

  public get openState(): boolean {
    return this.options.open ?? false;
  }

  public get actualOpenState(): boolean {
    return this.actualOpenStateValue;
  }

  public setContent(content: PopupContentLike | undefined): this {
    this.patchOptions({ content } as Partial<TOptions>);
    return this;
  }

  public setHTML(html: string): this {
    return this.setContent(html);
  }

  public setText(text: string): this {
    return this.setContent(text);
  }

  public clearContent(): this {
    return this.setContent(undefined);
  }

  public setOpen(open: boolean): this {
    if (open) {
      this.assertCapability(MAP_CAPABILITY_KEYS.overlay.popupOpen);
    }

    if (open === this.openState) {
      return this;
    }

    this.patchOptions({ open } as Partial<TOptions>);
    this.fire("openChanged", { id: this.id, open });
    return this;
  }

  public open(): this {
    return this.setOpen(true);
  }

  public close(): this {
    return this.setOpen(false);
  }

  public toggle(): this {
    return this.setOpen(!this.openState);
  }

  public isOpen(): boolean {
    return this.actualOpenStateValue;
  }

  public setMaxWidth(maxWidth: string | number | undefined): this {
    this.patchOptions({ maxWidth } as Partial<TOptions>);
    return this;
  }

  public setCloseButtonEnabled(closeButton: boolean): this {
    this.patchOptions({ closeButton } as Partial<TOptions>);
    return this;
  }

  public setCloseOnClick(closeOnClick: boolean): this {
    this.patchOptions({ closeOnClick } as Partial<TOptions>);
    return this;
  }

  public setCloseOnMove(closeOnMove: boolean): this {
    this.patchOptions({ closeOnMove } as Partial<TOptions>);
    return this;
  }

  public setFocusAfterOpen(focusAfterOpen: boolean): this {
    this.patchOptions({ focusAfterOpen } as Partial<TOptions>);
    return this;
  }

  public toStandardOverlayDefinition(): PopupOverlayDefinition {
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
