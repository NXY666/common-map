import {AbstractAnchoredOverlay} from "./anchored";
import {mapCapabilityKeys} from "@/core/capability";
import type {PopupContentLike, PopupOverlayDefinition, PopupOverlayEvent, PopupOverlayOptions,} from "./types";

export abstract class AbstractPopupOverlay<
	TOptions extends PopupOverlayOptions = PopupOverlayOptions,
	TOverlayHandle = unknown,
> extends AbstractAnchoredOverlay<
	TOptions,
	PopupOverlayDefinition,
	PopupOverlayEvent,
	TOverlayHandle
> {
	public readonly kind = "popup" as const;

	public readonly meta = {
		renderLayer: "dom-overlay",
		interactionLayer: "dom",
		description:
			"一个锚定到地理坐标或 marker 的浮动信息气泡，用于展示短内容、动作入口和临时详情。",
	} as const;

	private actualOpenValue: boolean;

	protected constructor(id: string, options: TOptions) {
		super(id, options);
		this.actualOpenValue = false;

		this.on("opened", () => {
			this.actualOpenValue = true;
		});

		this.on("closed", () => {
			this.actualOpenValue = false;
		});

		this.on("unmounted", () => {
			this.actualOpenValue = false;
		});
	}

	public get requestedOpen(): boolean {
		return this.options.open ?? false;
	}

	public get actualOpen(): boolean {
		return this.actualOpenValue;
	}

	public setContent(content: PopupContentLike | undefined): this {
		this.setOptions("content", content);
		return this;
	}

	public setHtml(html: string): this {
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
			this.assertCapability(mapCapabilityKeys.overlay.popupOpen);
		}

		if (open === this.requestedOpen) {
			return this;
		}

		return this.setOptions("open", open);
	}

	public open(): this {
		return this.setOpen(true);
	}

	public close(): this {
		return this.setOpen(false);
	}

	public toggle(): this {
		return this.setOpen(!this.requestedOpen);
	}

	public isOpen(): boolean {
		return this.actualOpenValue;
	}

	public setMaxWidth(maxWidth: string | number | undefined): this {
		this.setOptions("maxWidth", maxWidth);
		return this;
	}

	public setCloseButtonEnabled(closeButton: boolean): this {
		this.setOptions("closeButton", closeButton);
		return this;
	}

	public setCloseOnClick(closeOnClick: boolean): this {
		this.setOptions("closeOnClick", closeOnClick);
		return this;
	}

	public setCloseOnMove(closeOnMove: boolean): this {
		this.setOptions("closeOnMove", closeOnMove);
		return this;
	}

	public setFocusAfterOpen(focusAfterOpen: boolean): this {
		this.setOptions("focusAfterOpen", focusAfterOpen);
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
