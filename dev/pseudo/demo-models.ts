import type {LayerSpecification, SourceSpecification} from "maplibre-gl";
import {AbstractDataLayer, type DataLayerOptions} from "@/core/layer";
import {AbstractMap} from "@/core/map";
import type {DataLayerDefinition, EngineExtensionMap, SourceDefinition, UnifiedMapOptions,} from "@/core/types";
import type {
	AbstractMapAdapter,
	FullscreenControlOptions,
	GeolocateControlOptions,
	MarkerOverlayOptions,
	NavigationControlOptions,
	PopupOverlayOptions,
} from "@/index";
import {
	AbstractFullscreenControl,
	AbstractGeolocateControl,
	AbstractMarkerOverlay,
	AbstractNavigationControl,
	AbstractPopupOverlay,
	AbstractSource,
} from "@/index";
import type {PseudoHandles} from "./pseudo-adapters";

interface MapLibreEngineExtension {
  maplibre?: {
    source?: SourceSpecification;
    layer?: LayerSpecification;
  };
}

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

export class DemoGeoJsonSource extends AbstractSource<
  DemoGeoJsonSourceOptions,
  SourceDefinition<"geojson", DemoGeoJsonSourceOptions>,
  PseudoHandles["source"]
> {
  public readonly kind = "geojson" as const;

  public constructor(id: string, options: DemoGeoJsonSourceOptions) {
    super(id, options);
  }

  public setData(data: DemoFeatureCollection): this {
    this.patchOptions({ data });
    return this.notifyDataChanged("replace-data");
  }

  public toSourceDefinition(): SourceDefinition<"geojson", DemoGeoJsonSourceOptions> {
    return {
      id: this.id,
      kind: this.kind,
      options: this.options,
      engineExtensions: {
        maplibre: {
          source: {
            type: "geojson",
            data: this.options.data,
            cluster: this.options.cluster,
            tolerance: this.options.tolerance,
          } as unknown as SourceSpecification,
        },
      } satisfies MapLibreEngineExtension as EngineExtensionMap,
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
  "line",
  DemoLinePaint,
  DemoLineLayerOptions,
  PseudoHandles["layer"]
> {
  public readonly kind = "line" as const;

  public constructor(id: string, options: DemoLineLayerOptions) {
    super(id, options);
  }

  public toLayerDefinition(): DataLayerDefinition<"line", DemoLinePaint> {
    return {
      id: this.id,
      domain: this.domain,
      kind: this.kind,
      sourceId: this.options.sourceId,
      beforeId: this.options.beforeId,
      layout: this.options.layout,
      paint: this.options.paint,
      filter: this.options.filter,
      minZoom: this.options.minzoom,
      maxZoom: this.options.maxzoom,
      metadata: this.options.metadata,
      engineExtensions: {
        maplibre: {
          layer: {
            id: this.id,
            type: "line",
            source: this.options.sourceId,
            paint: this.options.paint,
            layout: this.options.layout,
            filter: this.options.filter as never,
          } as LayerSpecification,
        },
      } satisfies MapLibreEngineExtension as EngineExtensionMap,
    };
  }
}

export interface DemoMarkerOverlayOptions extends MarkerOverlayOptions {
  color: string;
  label?: string;
}

export class DemoMarkerOverlay extends AbstractMarkerOverlay<
  DemoMarkerOverlayOptions,
  PseudoHandles["overlay"]
> {
  public constructor(id: string, options: DemoMarkerOverlayOptions) {
    super(id, {
      draggable: false,
      ...options,
      visual: options.visual ?? {
        type: "default",
        color: options.color,
      },
    });
  }
}

export interface DemoPopupOverlayOptions extends PopupOverlayOptions {}

export class DemoPopupOverlay extends AbstractPopupOverlay<
  DemoPopupOverlayOptions,
  PseudoHandles["overlay"]
> {
  public constructor(id: string, options: DemoPopupOverlayOptions) {
    super(id, {
      closeButton: true,
      closeOnClick: true,
      ...options,
    });
  }
}

export interface DemoNavigationControlOptions extends NavigationControlOptions {}

export class DemoNavigationControl extends AbstractNavigationControl<
  DemoNavigationControlOptions,
  PseudoHandles["control"]
> {
  public constructor(
    id: string,
    options: DemoNavigationControlOptions = {},
  ) {
    super(id, {
      showZoom: true,
      showCompass: true,
      ...options,
    });
  }
}

export interface DemoFullscreenControlOptions extends FullscreenControlOptions {}

export class DemoFullscreenControl extends AbstractFullscreenControl<
  DemoFullscreenControlOptions,
  PseudoHandles["control"]
> {
  public constructor(
    id: string,
    options: DemoFullscreenControlOptions = {},
  ) {
    super(id, {
      active: false,
      ...options,
    });
  }
}

export interface DemoGeolocateControlOptions extends GeolocateControlOptions {}

export class DemoGeolocateControl extends AbstractGeolocateControl<
  DemoGeolocateControlOptions,
  PseudoHandles["control"]
> {
  public constructor(
    id: string,
    options: DemoGeolocateControlOptions = {},
  ) {
    super(id, {
      tracking: false,
      showUserLocation: true,
      showAccuracyCircle: true,
      ...options,
    });
  }
}

export class DemoMap extends AbstractMap<PseudoHandles> {
  public constructor(
    options: UnifiedMapOptions,
    adapter: AbstractMapAdapter<PseudoHandles>,
  ) {
    super(adapter, options);
  }
}
