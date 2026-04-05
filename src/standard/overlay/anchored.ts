import type {EmptyEventMap, EventMapBase,} from "@/core/events";
import type {LngLatLike, OverlayAnchor, PixelOffset, PixelOffsetLike,} from "@/core/types";
import {addPixelOffset, normalizePixelOffset} from "@/standard";
import {AbstractStandardOverlay} from "./base";
import type {AnchoredOverlayOptions, StandardOverlayDefinition,} from "./types";

export abstract class AbstractAnchoredOverlay<
	TOptions extends AnchoredOverlayOptions,
	TDefinition extends StandardOverlayDefinition,
	TExtraEvents extends EventMapBase = EmptyEventMap,
	TOverlayHandle = unknown,
> extends AbstractStandardOverlay<
	TOptions,
	TDefinition,
	TExtraEvents,
	TOverlayHandle
> {
	public get coordinate(): LngLatLike {
		return this.options.coordinate;
	}

	public get anchor(): OverlayAnchor {
		return this.options.anchor ?? "auto";
	}

	public get offset(): PixelOffset {
		return normalizePixelOffset(this.options.offset);
	}

	public setCoordinate(coordinate: LngLatLike): this {
		return this.patchOptions({coordinate} as Partial<TOptions>);
	}

	public setAnchor(anchor: OverlayAnchor): this {
		this.patchOptions({anchor} as Partial<TOptions>);
		return this;
	}

	public setOffset(offset: PixelOffsetLike): this {
		this.patchOptions({offset} as Partial<TOptions>);
		return this;
	}

	public moveBy(offset: PixelOffsetLike): this {
		return this.setOffset(addPixelOffset(this.offset, offset));
	}
}
