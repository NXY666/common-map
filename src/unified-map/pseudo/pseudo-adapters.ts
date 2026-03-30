import { StaticCapabilityProfile, type MapCapability } from "../core/capability";
import { AbstractMapAdapter } from "../core/adapter";
import type { AbstractControl } from "../core/control";
import type { MapEventBridge } from "../core/internal-events";
import type { AbstractLayer } from "../core/layer";
import type { AbstractOverlay } from "../core/overlay";
import type { AbstractSource } from "../core/source";
import {
  describeContainer,
  toLngLatLiteral,
  type CameraState,
  type CameraTransition,
  type LngLatLike,
  type LngLatLiteral,
  type LayerDefinition,
  type MapMountTarget,
  type ScreenPoint,
  type UnifiedMapOptions,
  type UnifiedMapRuntimeOptions,
  type UnifiedMapStyle,
} from "../core/types";

interface PseudoNativeMap {
  engine: string;
  mapId: string;
  container: string;
  view: CameraState;
  style?: UnifiedMapStyle;
  interactive?: boolean;
  eventBridge: MapEventBridge;
}

type CapabilityConfig = {
  level: "none" | "emulated" | "native";
  summary: string;
  fallback?: string;
};

function capabilityTable(
  overrides: Partial<Record<MapCapability, CapabilityConfig>>,
) {
  return {
    "camera.bearing": {
      level: "native",
      summary: "Bearing can be controlled directly.",
    },
    "camera.pitch": {
      level: "native",
      summary: "Pitch can be controlled directly.",
    },
    "style.swap": {
      level: "native",
      summary: "Full style swapping is available.",
    },
    "source.management": {
      level: "native",
      summary: "Independent source registration is supported.",
    },
    "layer.management": {
      level: "native",
      summary: "Independent style layer registration is supported.",
    },
    "overlay.dom": {
      level: "native",
      summary: "DOM backed overlays are supported.",
    },
    "overlay.vector": {
      level: "native",
      summary: "Vector overlays are supported.",
    },
    "control.custom": {
      level: "native",
      summary: "Custom controls are supported.",
    },
    "projection.screen": {
      level: "native",
      summary: "Project / unproject is available.",
    },
    "events.map-mouse": {
      level: "native",
      summary: "Map mouse events are available.",
    },
    "events.map-touch": {
      level: "native",
      summary: "Map touch events are available.",
    },
    "events.layer-mouse": {
      level: "native",
      summary: "Layer mouse events are available.",
    },
    "events.layer-touch": {
      level: "native",
      summary: "Layer touch events are available.",
    },
    "events.overlay-mouse": {
      level: "native",
      summary: "Overlay mouse events are available.",
    },
    "events.overlay-touch": {
      level: "native",
      summary: "Overlay touch events are available.",
    },
    "events.overlay-drag": {
      level: "native",
      summary: "Overlay drag events are available.",
    },
    "events.keyboard": {
      level: "emulated",
      summary: "Keyboard events are bridged from the map container.",
    },
    "query.features": {
      level: "native",
      summary: "Rendered feature querying is available.",
    },
    "cluster.geojson": {
      level: "native",
      summary: "GeoJSON clustering is available.",
    },
    terrain: {
      level: "emulated",
      summary: "Terrain support depends on the concrete engine.",
      fallback: "Gracefully ignore terrain configuration.",
    },
    ...overrides,
  } satisfies Record<MapCapability, CapabilityConfig>;
}

function formatView(view: CameraState): string {
  const center = toLngLatLiteral(view.center);
  return `center=[${center.lng}, ${center.lat}], zoom=${view.zoom}, bearing=${view.bearing ?? 0}, pitch=${view.pitch ?? 0}`;
}

function shortJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function describeLayerPayload(layer: AbstractLayer): LayerDefinition {
  return layer.toLayerDefinition();
}

abstract class BasePseudoAdapter extends AbstractMapAdapter {
  public abstract override readonly engine: string;

  public override async load(): Promise<void> {
    this.record(`[${this.engine}] load()`);
  }

  protected createRuntime(
    target: MapMountTarget,
    options: Readonly<UnifiedMapOptions>,
    eventBridge: MapEventBridge,
  ): PseudoNativeMap {
    const runtime: PseudoNativeMap = {
      engine: this.engine,
      mapId: options.id,
      container: describeContainer(target.container),
      view: options.initialView,
      style: options.style,
      interactive: options.interactive,
      eventBridge,
    };

    this.record(
      `[${this.engine}] createMap(container=${runtime.container}, interactive=${options.interactive ?? true}, style=${String(
        options.style ?? "null",
      )})`,
    );
    return runtime;
  }

  public override createMap(
    target: MapMountTarget,
    options: Readonly<UnifiedMapOptions>,
    eventBridge: MapEventBridge,
  ): PseudoNativeMap {
    return this.createRuntime(target, options, eventBridge);
  }

  public override destroyMap(mapHandle: unknown): void {
    const runtime = mapHandle as PseudoNativeMap;
    this.record(`[${this.engine}] destroyMap(container=${runtime.container})`);
  }

  public override setView(
    mapHandle: unknown,
    view: CameraState,
    transition?: CameraTransition,
  ): void {
    const runtime = mapHandle as PseudoNativeMap;
    runtime.view = view;
    this.record(
      `[${this.engine}] setView(${formatView(view)}, animate=${transition?.animate ?? false})`,
    );

    runtime.eventBridge.emit("viewChanged", {
      mapId: runtime.mapId,
      view: runtime.view,
      reason: "api",
      inputType: "unknown",
    });
  }

  public override getView(mapHandle: unknown): CameraState {
    return (mapHandle as PseudoNativeMap).view;
  }

  public override updateMapOptions(
    mapHandle: unknown,
    nextOptions: Readonly<UnifiedMapRuntimeOptions>,
    _previousOptions: Readonly<UnifiedMapRuntimeOptions>,
  ): void {
    const runtime = mapHandle as PseudoNativeMap;
    runtime.style = nextOptions.style;
    runtime.interactive = nextOptions.interactive;

    this.record(
      `[${this.engine}] updateMapOptions(interactive=${nextOptions.interactive ?? true}, style=${String(
        nextOptions.style ?? "null",
      )})`,
    );
  }

  public override project(_mapHandle: unknown, lngLat: LngLatLike): ScreenPoint {
    const point = toLngLatLiteral(lngLat);
    return {
      x: point.lng * 10,
      y: point.lat * -10,
    };
  }

  public override unproject(_mapHandle: unknown, point: ScreenPoint): LngLatLiteral {
    return {
      lng: point.x / 10,
      lat: point.y / -10,
    };
  }
}

export class PseudoMapLibreAdapter extends BasePseudoAdapter {
  public override readonly engine = "maplibre";

  public constructor() {
    super(new StaticCapabilityProfile("maplibre", capabilityTable({})));
  }

  public override mountSource(
    _mapHandle: unknown,
    source: AbstractSource,
  ): unknown {
    this.record(
      `[maplibre] map.addSource("${source.id}", ${shortJson(
        source.toSourceDefinition().mapLibreSource ?? source.toSourceDefinition(),
      )})`,
    );
    return { type: "source", id: source.id };
  }

  public override updateSource(
    _mapHandle: unknown,
    source: AbstractSource,
    _sourceHandle: unknown,
  ): void {
    this.record(`[maplibre] syncSource("${source.id}")`);
  }

  public override unmountSource(
    _mapHandle: unknown,
    source: AbstractSource,
    _sourceHandle: unknown,
  ): void {
    this.record(`[maplibre] map.removeSource("${source.id}")`);
  }

  public override mountLayer(_mapHandle: unknown, layer: AbstractLayer): unknown {
    const definition = describeLayerPayload(layer);
    this.record(
      `[maplibre] map.addLayer(${shortJson(
        definition.domain === "data" && definition.mapLibreLayer
          ? definition.mapLibreLayer
          : definition,
      )})`,
    );
    return { type: "layer", id: layer.id };
  }

  public override updateLayer(
    _mapHandle: unknown,
    layer: AbstractLayer,
    _layerHandle: unknown,
  ): void {
    this.record(`[maplibre] syncLayer("${layer.id}")`);
  }

  public override unmountLayer(
    _mapHandle: unknown,
    layer: AbstractLayer,
    _layerHandle: unknown,
  ): void {
    this.record(`[maplibre] map.removeLayer("${layer.id}")`);
  }

  public override mountOverlay(
    _mapHandle: unknown,
    overlay: AbstractOverlay,
  ): unknown {
    this.record(
      `[maplibre] mountOverlay("${overlay.id}") via Marker/Popup bridge`,
    );
    return { type: "overlay", id: overlay.id };
  }

  public override updateOverlay(
    _mapHandle: unknown,
    overlay: AbstractOverlay,
    _overlayHandle: unknown,
  ): void {
    this.record(`[maplibre] syncOverlay("${overlay.id}")`);
  }

  public override unmountOverlay(
    _mapHandle: unknown,
    overlay: AbstractOverlay,
    _overlayHandle: unknown,
  ): void {
    this.record(`[maplibre] unmountOverlay("${overlay.id}")`);
  }

  public override mountControl(
    _mapHandle: unknown,
    control: AbstractControl,
  ): unknown {
    this.record(
      `[maplibre] map.addControl("${control.id}", position="${control.position}")`,
    );
    return { type: "control", id: control.id };
  }

  public override updateControl(
    _mapHandle: unknown,
    control: AbstractControl,
    _controlHandle: unknown,
  ): void {
    this.record(`[maplibre] syncControl("${control.id}")`);
  }

  public override unmountControl(
    _mapHandle: unknown,
    control: AbstractControl,
    _controlHandle: unknown,
  ): void {
    this.record(`[maplibre] map.removeControl("${control.id}")`);
  }
}

export class PseudoBMapGLAdapter extends BasePseudoAdapter {
  public override readonly engine = "bmapgl";

  public constructor() {
    super(
      new StaticCapabilityProfile(
        "bmapgl",
        capabilityTable({
          "camera.bearing": {
            level: "native",
            summary: "Heading can map to setHeading.",
          },
          "camera.pitch": {
            level: "native",
            summary: "Tilt can map to setTilt.",
          },
          "style.swap": {
            level: "emulated",
            summary: "Style swap is available through setMapStyle / setMapStyleV2.",
            fallback: "Limit the abstraction to style presets instead of style-spec diffs.",
          },
          "source.management": {
            level: "emulated",
            summary: "Sources are logical only and need adapter-side bookkeeping.",
            fallback: "Treat source as a data registry owned by the adapter.",
          },
          "layer.management": {
            level: "emulated",
            summary: "Layers often translate into overlay groups.",
            fallback: "Materialize layers into overlay batches.",
          },
          "events.map-mouse": {
            level: "native",
            summary: "Map mouse events can be bridged from BMapGL map events.",
          },
          "events.map-touch": {
            level: "emulated",
            summary: "Map touch events need DOM listeners on the map container.",
            fallback: "Bridge touch events from the mounted container element.",
          },
          "events.layer-mouse": {
            level: "emulated",
            summary: "Layer mouse events depend on GeoJSONLayer or picked-item support.",
            fallback: "Use layer-specific hit testing to bridge pointer interactions.",
          },
          "events.layer-touch": {
            level: "emulated",
            summary: "Layer touch events are not first-class and need hit-test emulation.",
            fallback: "Bridge touch interactions through adapter-side hit testing.",
          },
          "events.overlay-mouse": {
            level: "native",
            summary: "Overlay mouse events map to native overlay listeners.",
          },
          "events.overlay-touch": {
            level: "emulated",
            summary: "Overlay touch events depend on DOM bridges or adapter wrappers.",
            fallback: "Bridge touch interactions from DOM-backed overlays where possible.",
          },
          "events.overlay-drag": {
            level: "emulated",
            summary: "Overlay drag events are only native for selected overlay kinds.",
            fallback: "Restrict drag support to marker-like overlays.",
          },
          "events.keyboard": {
            level: "emulated",
            summary: "Keyboard events are exposed through the map container rather than BMapGL callbacks.",
            fallback: "Listen to DOM keyboard events on the mounted container.",
          },
          "query.features": {
            level: "none",
            summary: "Rendered feature querying is not equivalent to MapLibre.",
            fallback: "Use adapter-side hit testing for selected overlay types.",
          },
          "cluster.geojson": {
            level: "emulated",
            summary: "Clustered data needs BMap specific overlay helpers.",
            fallback: "Expand cluster features into point-collection or marker batches.",
          },
          terrain: {
            level: "none",
            summary: "Terrain is out of scope for the BMap adapter.",
            fallback: "Ignore terrain configuration.",
          },
        }),
      ),
    );
  }

  public override mountSource(
    _mapHandle: unknown,
    source: AbstractSource,
  ): unknown {
    this.record(
      `[bmapgl] registerLogicalSource("${source.id}") // BMapGL has no first-class source API`,
    );
    return { type: "logical-source", id: source.id };
  }

  public override updateSource(
    _mapHandle: unknown,
    source: AbstractSource,
    _sourceHandle: unknown,
  ): void {
    this.record(`[bmapgl] refreshLogicalSource("${source.id}")`);
  }

  public override unmountSource(
    _mapHandle: unknown,
    source: AbstractSource,
    _sourceHandle: unknown,
  ): void {
    this.record(`[bmapgl] disposeLogicalSource("${source.id}")`);
  }

  public override mountLayer(_mapHandle: unknown, layer: AbstractLayer): unknown {
    const definition = describeLayerPayload(layer);

    if (definition.domain === "system") {
      this.record(
        `[bmapgl] materializeSystemLayer("${layer.id}") => systemKind="${definition.systemKind}"`,
      );
      return { type: "system-layer", id: layer.id };
    }

    this.record(
      `[bmapgl] materializeDataLayer("${layer.id}") => translate data from source "${definition.sourceId ?? "none"}" into overlay group`,
    );
    return { type: "overlay-group", id: layer.id };
  }

  public override updateLayer(
    _mapHandle: unknown,
    layer: AbstractLayer,
    _layerHandle: unknown,
  ): void {
    const definition = describeLayerPayload(layer);
    this.record(
      definition.domain === "system"
        ? `[bmapgl] syncSystemLayer("${layer.id}")`
        : `[bmapgl] diffOverlayGroup("${layer.id}")`,
    );
  }

  public override unmountLayer(
    _mapHandle: unknown,
    layer: AbstractLayer,
    _layerHandle: unknown,
  ): void {
    const definition = describeLayerPayload(layer);
    this.record(
      definition.domain === "system"
        ? `[bmapgl] disposeSystemLayer("${layer.id}")`
        : `[bmapgl] clearOverlayGroup("${layer.id}")`,
    );
  }

  public override mountOverlay(
    _mapHandle: unknown,
    overlay: AbstractOverlay,
  ): unknown {
    this.record(
      `[bmapgl] map.addOverlay("${overlay.id}") // maps to Marker / Polyline / Polygon / custom Overlay.initialize`,
    );
    return { type: "overlay", id: overlay.id };
  }

  public override updateOverlay(
    _mapHandle: unknown,
    overlay: AbstractOverlay,
    _overlayHandle: unknown,
  ): void {
    this.record(`[bmapgl] syncOverlay("${overlay.id}")`);
  }

  public override unmountOverlay(
    _mapHandle: unknown,
    overlay: AbstractOverlay,
    _overlayHandle: unknown,
  ): void {
    this.record(`[bmapgl] map.removeOverlay("${overlay.id}")`);
  }

  public override mountControl(
    _mapHandle: unknown,
    control: AbstractControl,
  ): unknown {
    this.record(
      `[bmapgl] map.addControl("${control.id}") // anchor resolved from "${control.position}"`,
    );
    return { type: "control", id: control.id };
  }

  public override updateControl(
    _mapHandle: unknown,
    control: AbstractControl,
    _controlHandle: unknown,
  ): void {
    this.record(`[bmapgl] syncControl("${control.id}")`);
  }

  public override unmountControl(
    _mapHandle: unknown,
    control: AbstractControl,
    _controlHandle: unknown,
  ): void {
    this.record(`[bmapgl] map.removeControl("${control.id}")`);
  }
}
