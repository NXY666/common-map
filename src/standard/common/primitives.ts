export type RenderLayer = "dom-overlay" | "vector-overlay" | "control-dom";

export type InteractionLayer = "dom" | "engine" | "mixed";

export interface StandardObjectMeta {
	renderLayer: RenderLayer;

	interactionLayer: InteractionLayer;

	description: string;
}
