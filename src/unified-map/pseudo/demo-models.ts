import type {
  LayerSpecification,
  SourceSpecification,
} from "maplibre-gl";
import { AbstractControl, type ControlOptions } from "../core/control";
import { AbstractDataLayer, type DataLayerOptions } from "../core/layer";
import { AbstractMap } from "../core/map";
import { AbstractOverlay, type OverlayOptions } from "../core/overlay";
import { AbstractSource } from "../core/source";
import type {
  ControlDefinition,
  ControlSlot,
  DataLayerDefinition,
  LngLatLike,
  OverlayDefinition,
  SourceDefinition,
  UnifiedMapOptions,
} from "../core/types";
import type { AbstractMapAdapter } from "../core/adapter";

type DemoGeometry =
  | {
      type: "Point";
      coordinates: readonly [number, number];
    }
  | {
      type: "LineString";
      coordinates: ReadonlyArray<readonly [number, number]>;
    };

interface DemoFeature {
  type: "Feature";
  geometry: DemoGeometry;
  properties?: Record<string, unknown>;
}

export interface DemoFeatureCollection {
  type: "FeatureCollection";
  features: ReadonlyArray<DemoFeature>;
}

export interface DemoGeoJsonSourceOptions {
  data: DemoFeatureCollection;
  cluster?: boolean;
  tolerance?: number;
}

export class DemoGeoJsonSource extends AbstractSource<DemoGeoJsonSourceOptions> {
  public readonly kind = "geojson" as const;

  public constructor(id: string, options: DemoGeoJsonSourceOptions) {
    super(id, options);
  }

  public setData(data: DemoFeatureCollection): this {
    this.patchOptions({ data });
    return this.notifyDataChanged("replace-data");
  }

  public toSourceDefinition(): SourceDefinition<DemoGeoJsonSourceOptions> {
    return {
      id: this.id,
      kind: this.kind,
      options: this.options,
      mapLibreSource: {
        type: "geojson",
        data: this.options.data,
        cluster: this.options.cluster,
        tolerance: this.options.tolerance,
      } as unknown as SourceSpecification,
    };
  }
}

export interface DemoLinePaint {
  "line-color": string;
  "line-width": number;
}

export interface DemoLineLayerOptions extends DataLayerOptions<DemoLinePaint> {
  sourceId: string;
}

export class DemoLineLayer extends AbstractDataLayer<
  DemoLinePaint,
  DemoLineLayerOptions
> {
  public readonly kind = "line" as const;

  public constructor(id: string, options: DemoLineLayerOptions) {
    super(id, options);
  }

  public toLayerDefinition(): DataLayerDefinition<DemoLinePaint> {
    return {
      id: this.id,
      domain: this.domain,
      kind: this.kind,
      sourceId: this.options.sourceId,
      beforeId: this.options.beforeId,
      layout: this.options.layout,
      paint: this.options.paint,
      filter: this.options.filter,
      minzoom: this.options.minzoom,
      maxzoom: this.options.maxzoom,
      metadata: this.options.metadata,
      mapLibreLayer: {
        id: this.id,
        type: "line",
        source: this.options.sourceId,
        paint: this.options.paint,
        layout: this.options.layout,
        filter: this.options.filter as never,
      } as LayerSpecification,
    };
  }
}

export interface DemoMarkerOverlayOptions extends OverlayOptions {
  coordinate: LngLatLike;
  color: string;
  label?: string;
}

export class DemoMarkerOverlay extends AbstractOverlay<DemoMarkerOverlayOptions> {
  public readonly kind = "marker" as const;

  public constructor(id: string, options: DemoMarkerOverlayOptions) {
    super(id, options);
  }

  public toOverlayDefinition(): OverlayDefinition<DemoMarkerOverlayOptions> {
    return {
      id: this.id,
      kind: this.kind,
      coordinate: this.options.coordinate,
      visible: this.options.visible,
      zIndex: this.options.zIndex,
      options: this.options,
      metadata: this.options.metadata,
    };
  }
}

export interface DemoNavigationControlOptions extends ControlOptions {
  compass?: boolean;
  showZoom?: boolean;
}

export class DemoNavigationControl extends AbstractControl<DemoNavigationControlOptions> {
  public readonly kind = "navigation" as const;

  public constructor(
    id: string,
    options: DemoNavigationControlOptions = {},
  ) {
    super(id, options);
  }

  protected override getDefaultPosition(): ControlSlot {
    return "top-right";
  }

  public toControlDefinition(): ControlDefinition<DemoNavigationControlOptions> {
    return {
      id: this.id,
      kind: this.kind,
      position: this.position,
      visible: this.options.visible,
      options: this.options,
      metadata: this.options.metadata,
    };
  }
}

export class DemoMap extends AbstractMap {
  public constructor(options: UnifiedMapOptions, adapter: AbstractMapAdapter) {
    super(adapter, options);
  }
}
