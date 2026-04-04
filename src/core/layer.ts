import {AbstractMapEntity} from "./entity";
import type {LayerExtraEventMap} from "./events";
import type {
	DataLayerDefinition,
	DataLayerKind,
	LayerDefinition,
	LayerDomain,
	LayerKind,
	SystemLayerDefinition,
	SystemLayerKind,
} from "./types";

export interface BaseLayerOptions {
  visible?: boolean;
  zIndex?: number;
  metadata?: Record<string, unknown>;
}

export interface DataLayerOptions<TPaint extends object = object>
  extends BaseLayerOptions {
  sourceId?: string;
  beforeId?: string;
  layout?: Record<string, unknown>;
  paint?: TPaint;
  filter?: unknown;
  minzoom?: number;
  maxzoom?: number;
}

export interface SystemLayerOptions extends BaseLayerOptions {}

export abstract class AbstractLayer<
  TOptions extends BaseLayerOptions = BaseLayerOptions,
  TDefinition extends LayerDefinition = LayerDefinition,
  TLayerHandle = unknown,
> extends AbstractMapEntity<
  TOptions,
  TLayerHandle,
  LayerExtraEventMap<TOptions>
> {
  public abstract readonly kind: LayerKind;
  public abstract readonly domain: LayerDomain;

  public get visible(): boolean {
    return this.options.visible ?? true;
  }

  public get zIndex(): number | undefined {
    return this.options.zIndex;
  }

  public get sourceId(): string | undefined {
    return undefined;
  }

  public setVisibility(visible: boolean): this {
    this.patchOptions({ visible } as Partial<TOptions>);
    this.fire("visibilityChanged", {
      id: this.id,
      visible,
    });
    return this;
  }

  public setZIndex(zIndex: number | undefined): this {
    this.patchOptions({ zIndex } as Partial<TOptions>);
    this.fire("zIndexChanged", {
      id: this.id,
      zIndex,
    });
    return this;
  }

  public abstract toLayerDefinition(): TDefinition;
}

export abstract class AbstractDataLayer<
  TPaint extends object = object,
  TOptions extends DataLayerOptions<TPaint> = DataLayerOptions<TPaint>,
  TLayerHandle = unknown,
> extends AbstractLayer<
  TOptions,
  DataLayerDefinition<TPaint>,
  TLayerHandle
> {
  public abstract override readonly kind: DataLayerKind;
  public readonly domain = "data" as const;

  public override get sourceId(): string | undefined {
    return this.options.sourceId;
  }
}

export abstract class AbstractSystemLayer<
  TSystemKind extends SystemLayerKind = SystemLayerKind,
  TOptions extends SystemLayerOptions = SystemLayerOptions,
  TLayerHandle = unknown,
> extends AbstractLayer<
  TOptions,
  SystemLayerDefinition<TOptions, TSystemKind>,
  TLayerHandle
> {
  public readonly kind = "system" as const;
  public readonly domain = "system" as const;
  public abstract readonly systemKind: TSystemKind;
}
