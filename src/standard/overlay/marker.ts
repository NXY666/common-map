import {mapCapabilityKeys} from "@/core/capability";
import type {EmptyEventMap} from "@/core/events";
import type {Alignment} from "@/core/types";
import {AbstractAnchoredOverlay} from "./anchored";
import {AbstractPopupOverlay} from "./popup";
import type {MarkerOverlayDefinition, MarkerOverlayOptions, MarkerVisual, PopupOverlayOptions,} from "./types";

export abstract class AbstractMarkerOverlay<
	TOptions extends MarkerOverlayOptions = MarkerOverlayOptions,
	TOverlayHandle = unknown,
> extends AbstractAnchoredOverlay<
	TOptions,
	MarkerOverlayDefinition,
	EmptyEventMap,
	TOverlayHandle
> {
	public readonly kind = "marker" as const;

	public readonly meta = {
		renderLayer: "dom-overlay",
		interactionLayer: "dom",
		description:
			"一个有唯一地理锚点的点对象，主要用于少量、高交互、可拖拽、可绑定 popup 的点标注。",
	} as const;

	protected popupRef?: AbstractPopupOverlay<PopupOverlayOptions, TOverlayHandle>;

	public get draggable(): boolean {
		return this.options.draggable ?? false;
	}

	public get popup(): AbstractPopupOverlay<PopupOverlayOptions, TOverlayHandle> | undefined {
		return this.popupRef;
	}

	public setVisual(visual: MarkerVisual | undefined): this {
		this.setOptions("visual", visual);
		return this;
	}

	public setDraggable(draggable: boolean): this {
		if (draggable) {
			this.assertCapability(mapCapabilityKeys.overlay.markerDrag);
		}

		this.setOptions("draggable", draggable);
		return this;
	}

	public enableDragging(): this {
		return this.setDraggable(true);
	}

	public disableDragging(): this {
		return this.setDraggable(false);
	}

	public setRotation(rotation: number | undefined): this {
		this.setOptions("rotation", rotation);
		return this;
	}

	public setRotationAlignment(alignment: Alignment | undefined): this {
		this.setOptions("rotationAlignment", alignment);
		return this;
	}

	public setPitchAlignment(alignment: Alignment | undefined): this {
		this.setOptions("pitchAlignment", alignment);
		return this;
	}

	public bindPopup(popup: AbstractPopupOverlay<PopupOverlayOptions, TOverlayHandle> | null): this {
		const nextPopup = popup ?? undefined;
		const currentPopup = this.popupRef;

		if (currentPopup === nextPopup) {
			return this;
		}

		if (nextPopup) {
			// marker 与 popup 必须属于同一个 map
			this.assertCapability(mapCapabilityKeys.overlay.markerBindPopup);

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
		return this.touch();
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
