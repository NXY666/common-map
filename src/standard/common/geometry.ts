import type {PixelOffset, PixelOffsetLike} from "@/core/types";

function isPixelOffset(offset: PixelOffsetLike): offset is PixelOffset {
	return !Array.isArray(offset);
}

export function normalizePixelOffset(offset?: PixelOffsetLike): PixelOffset {
	if (!offset) {
		return {x: 0, y: 0};
	}

	if (isPixelOffset(offset)) {
		return offset;
	}

	return {x: offset[0], y: offset[1]};
}

export function addPixelOffset(
	base: PixelOffset,
	delta: PixelOffsetLike,
): PixelOffset {
	const normalized = normalizePixelOffset(delta);
	return {
		x: base.x + normalized.x,
		y: base.y + normalized.y,
	};
}
