import { StaticCapabilityProfile, type MapCapability } from "../core/capability";
import { AbstractMapAdapter } from "../core/adapter";
import type { AbstractControl } from "../core/control";
import {
  emitControlEvent,
  emitOverlayEvent,
  type MapEventBridge,
} from "../core/internal-events";
import type { AbstractLayer } from "../core/layer";
import type { AbstractOverlay } from "../core/overlay";
import type { AbstractSource } from "../core/source";
import {
  type ControlDefinition,
  describeContainer,
  type OverlayDefinition,
  toLngLatLiteral,
  type CameraState,
  type CameraTransition,
  type LngLatLike,
  type LngLatLiteral,
  type MapMountTarget,
  type ScreenPoint,
  type UnifiedMapOptions,
  type UnifiedMapRuntimeOptions,
  type UnifiedMapStyle,
} from "../core/types";
import { AbstractFullscreenControl } from "../standard/control/fullscreen";
import { AbstractGeolocateControl } from "../standard/control/geolocate";
import type { StandardControlDefinition } from "../standard/control/types";
import { AbstractPopupOverlay } from "../standard/overlay/popup";
import type { StandardOverlayDefinition } from "../standard/overlay/types";

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
    "overlay.marker": {
      level: "native",
      summary: "Marker overlays are supported.",
    },
    "overlay.popup": {
      level: "native",
      summary: "Popup overlays are supported.",
    },
    "overlay.polyline": {
      level: "native",
      summary: "Polyline overlays are supported.",
    },
    "overlay.polygon": {
      level: "native",
      summary: "Polygon overlays are supported.",
    },
    "overlay.circle": {
      level: "native",
      summary: "Circle overlays are supported.",
    },
    "overlay.marker.drag": {
      level: "native",
      summary: "Marker dragging is supported.",
    },
    "overlay.marker.bindPopup": {
      level: "native",
      summary: "Marker to popup binding is supported.",
    },
    "overlay.popup.open": {
      level: "native",
      summary: "Popup open state is supported.",
    },
    "control.navigation": {
      level: "native",
      summary: "Navigation control is supported.",
    },
    "control.scale": {
      level: "native",
      summary: "Scale control is supported.",
    },
    "control.fullscreen": {
      level: "native",
      summary: "Fullscreen control is supported.",
    },
    "control.fullscreen.active": {
      level: "native",
      summary: "Fullscreen active state is supported.",
    },
    "control.geolocate": {
      level: "native",
      summary: "Geolocate control is supported.",
    },
    "control.geolocate.tracking": {
      level: "native",
      summary: "Geolocate tracking state is supported.",
    },
    "control.attribution": {
      level: "native",
      summary: "Attribution control is supported.",
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

function isStandardOverlayDefinition(
  definition: OverlayDefinition,
): definition is StandardOverlayDefinition {
  return (
    definition.kind === "marker" ||
    definition.kind === "popup" ||
    definition.kind === "dom" ||
    definition.kind === "polyline" ||
    definition.kind === "polygon" ||
    definition.kind === "circle"
  );
}

function isStandardControlDefinition(
  definition: ControlDefinition,
): definition is StandardControlDefinition {
  return (
    definition.kind === "navigation" ||
    definition.kind === "scale" ||
    definition.kind === "fullscreen" ||
    definition.kind === "geolocate" ||
    definition.kind === "attribution"
  );
}

function formatLngLat(value: LngLatLike): string {
  const literal = toLngLatLiteral(value);
  return `[${literal.lng}, ${literal.lat}]`;
}

function describeOverlayDefinition(
  definition: OverlayDefinition,
  engine: "maplibre" | "bmapgl",
): string {
  if (!isStandardOverlayDefinition(definition)) {
    return `kind=${definition.kind}, payload=${shortJson(definition)}`;
  }

  switch (definition.kind) {
    case "marker":
      return `kind=marker, coordinate=${formatLngLat(definition.options.coordinate)}, draggable=${definition.options.draggable ?? false}, popupId=${definition.popupId ?? "none"}`;
    case "popup":
      return `kind=popup, coordinate=${formatLngLat(definition.options.coordinate)}, open=${definition.options.open ?? false}`;
    case "dom":
      return `kind=dom, coordinate=${formatLngLat(definition.options.coordinate)}, interactive=${definition.options.interactive ?? false}`;
    case "polyline":
      return `kind=polyline, points=${definition.options.coordinates.length}, strategy=${engine === "maplibre" ? "temporary source/layer bridge" : "native polyline"}`;
    case "polygon":
      return `kind=polygon, points=${definition.options.coordinates.length}, strategy=${engine === "maplibre" ? "temporary source/layer bridge" : "native polygon"}`;
    case "circle":
      return `kind=circle, center=${formatLngLat(definition.options.coordinate)}, radius=${definition.options.radius}, strategy=${engine === "maplibre" ? "temporary source/layer bridge" : "native circle"}`;
    default:
      return "kind=unknown";
  }
}

function describeControlDefinition(definition: ControlDefinition): string {
  if (!isStandardControlDefinition(definition)) {
    return `kind=${definition.kind}, payload=${shortJson(definition)}`;
  }

  switch (definition.kind) {
    case "navigation":
      return `kind=navigation, position=${definition.position ?? "top-right"}, showZoom=${definition.options.showZoom ?? true}, showCompass=${definition.options.showCompass ?? true}`;
    case "scale":
      return `kind=scale, position=${definition.position ?? "bottom-left"}, unit=${definition.options.unit ?? "metric"}`;
    case "fullscreen":
      return `kind=fullscreen, position=${definition.position ?? "top-right"}, active=${definition.options.active ?? false}`;
    case "geolocate":
      return `kind=geolocate, position=${definition.position ?? "top-right"}, tracking=${definition.options.tracking ?? false}`;
    case "attribution": {
      const value = definition.options.customAttribution;
      const count = Array.isArray(value) ? value.length : value ? 1 : 0;
      return `kind=attribution, position=${definition.position ?? "bottom-right"}, customAttributionCount=${count}`;
    }
    default:
      return "kind=unknown";
  }
}

abstract class BasePseudoAdapter extends AbstractMapAdapter {
  public abstract override readonly engine: string;
  private readonly popupOpenStates = new Map<string, boolean>();
  private readonly fullscreenActiveStates = new Map<string, boolean>();
  private readonly geolocateRuntimeStates = new Map<
    string,
    {
      tracking: boolean;
      locateRequestVersion: number;
    }
  >();

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

  protected syncOverlayRuntimeState(overlay: AbstractOverlay): void {
    if (!(overlay instanceof AbstractPopupOverlay)) {
      return;
    }

    this.syncObservedBooleanState(
      this.popupOpenStates,
      overlay.id,
      overlay.openState,
      () => {
        emitOverlayEvent(overlay, "opened", {
          id: overlay.id,
        });
      },
      () => {
        emitOverlayEvent(overlay, "closed", {
          id: overlay.id,
        });
      },
    );
  }

  protected clearOverlayRuntimeState(overlayId: string): void {
    this.popupOpenStates.delete(overlayId);
  }

  protected syncControlRuntimeState(
    mapHandle: unknown,
    control: AbstractControl,
  ): void {
    if (control instanceof AbstractFullscreenControl) {
      this.syncObservedBooleanState(
        this.fullscreenActiveStates,
        control.id,
        control.active,
        () => {
          emitControlEvent(control, "entered", {
            id: control.id,
          });
        },
        () => {
          emitControlEvent(control, "exited", {
            id: control.id,
          });
        },
      );

      return;
    }

    if (control instanceof AbstractGeolocateControl) {
      this.syncGeolocateRuntimeState(mapHandle, control);
    }
  }

  protected clearControlRuntimeState(controlId: string): void {
    this.fullscreenActiveStates.delete(controlId);
    this.geolocateRuntimeStates.delete(controlId);
  }

  private syncObservedBooleanState(
    states: Map<string, boolean>,
    entityId: string,
    nextValue: boolean,
    onTrue: () => void,
    onFalse: () => void,
  ): void {
    const previousValue = states.get(entityId);

    // First observation builds runtime baseline.
    // Emit only positive confirmation to avoid fake "closed/exited" noise.
    if (previousValue === undefined) {
      states.set(entityId, nextValue);
      if (nextValue) {
        onTrue();
      }
      return;
    }

    if (previousValue === nextValue) {
      return;
    }

    states.set(entityId, nextValue);
    if (nextValue) {
      onTrue();
    } else {
      onFalse();
    }
  }

  private syncGeolocateRuntimeState(
    mapHandle: unknown,
    control: AbstractGeolocateControl,
  ): void {
    const currentState = {
      tracking: control.tracking,
      locateRequestVersion: control.options.locateRequestVersion ?? 0,
    };

    const previousState = this.geolocateRuntimeStates.get(control.id) ?? {
      tracking: false,
      locateRequestVersion: 0,
    };

    const locateRequested =
      currentState.locateRequestVersion > previousState.locateRequestVersion;
    const trackingStarted = currentState.tracking && !previousState.tracking;

    if (!locateRequested && !trackingStarted) {
      this.geolocateRuntimeStates.set(control.id, currentState);
      return;
    }

    const timeout = control.options.positionOptions?.timeout;
    if (timeout === 0) {
      emitControlEvent(control, "error", {
        id: control.id,
        code: 3,
        message: "Pseudo geolocation request timed out immediately (timeout=0).",
      });
      this.geolocateRuntimeStates.set(control.id, currentState);
      return;
    }

    const runtime = mapHandle as PseudoNativeMap;
    emitControlEvent(control, "geolocate", {
      id: control.id,
      coordinate: toLngLatLiteral(runtime.view.center),
      accuracyMeters: 15,
    });

    this.geolocateRuntimeStates.set(control.id, currentState);
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
    const definition = layer.toLayerDefinition();
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
    const definition = overlay.toOverlayDefinition();
    this.record(
      `[maplibre] mountOverlay("${overlay.id}", ${describeOverlayDefinition(definition, "maplibre")})`,
    );
    this.syncOverlayRuntimeState(overlay);
    return { type: "overlay", id: overlay.id, kind: definition.kind };
  }

  public override updateOverlay(
    _mapHandle: unknown,
    overlay: AbstractOverlay,
    _overlayHandle: unknown,
  ): void {
    const definition = overlay.toOverlayDefinition();
    this.record(
      `[maplibre] syncOverlay("${overlay.id}", ${describeOverlayDefinition(definition, "maplibre")})`,
    );
    this.syncOverlayRuntimeState(overlay);
  }

  public override unmountOverlay(
    _mapHandle: unknown,
    overlay: AbstractOverlay,
    _overlayHandle: unknown,
  ): void {
    this.record(`[maplibre] unmountOverlay("${overlay.id}")`);
    this.clearOverlayRuntimeState(overlay.id);
  }

  public override mountControl(
    _mapHandle: unknown,
    control: AbstractControl,
  ): unknown {
    const definition = control.toControlDefinition();
    this.record(
      `[maplibre] map.addControl("${control.id}", ${describeControlDefinition(definition)})`,
    );
    this.syncControlRuntimeState(_mapHandle, control);
    return { type: "control", id: control.id, kind: definition.kind };
  }

  public override updateControl(
    _mapHandle: unknown,
    control: AbstractControl,
    _controlHandle: unknown,
  ): void {
    const definition = control.toControlDefinition();
    this.record(
      `[maplibre] syncControl("${control.id}", ${describeControlDefinition(definition)})`,
    );
    this.syncControlRuntimeState(_mapHandle, control);
  }

  public override unmountControl(
    _mapHandle: unknown,
    control: AbstractControl,
    _controlHandle: unknown,
  ): void {
    this.record(`[maplibre] map.removeControl("${control.id}")`);
    this.clearControlRuntimeState(control.id);
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
          "overlay.marker": {
            level: "native",
            summary: "Marker overlays map directly to BMapGL markers.",
          },
          "overlay.popup": {
            level: "native",
            summary: "Popup overlays map to native info window primitives.",
          },
          "overlay.polyline": {
            level: "native",
            summary: "Polyline overlays map to native polylines.",
          },
          "overlay.polygon": {
            level: "native",
            summary: "Polygon overlays map to native polygons.",
          },
          "overlay.circle": {
            level: "native",
            summary: "Circle overlays map to native circles.",
          },
          "overlay.marker.drag": {
            level: "emulated",
            summary: "Marker drag behavior depends on overlay kind configuration.",
            fallback: "Restrict drag support to marker-like overlays.",
          },
          "overlay.marker.bindPopup": {
            level: "emulated",
            summary: "Marker and popup binding needs adapter-side relationship tracking.",
            fallback: "Bridge marker click events to popup state.",
          },
          "overlay.popup.open": {
            level: "native",
            summary: "Popup open and close state can map to native calls.",
          },
          "control.navigation": {
            level: "native",
            summary: "Navigation control maps to native zoom and pan controls.",
          },
          "control.scale": {
            level: "native",
            summary: "Scale control maps to native scale control.",
          },
          "control.fullscreen": {
            level: "emulated",
            summary: "Fullscreen control relies on container DOM fullscreen APIs.",
            fallback: "Use pseudo fullscreen mode on the map container.",
          },
          "control.fullscreen.active": {
            level: "emulated",
            summary: "Fullscreen active state is tracked through DOM bridge events.",
            fallback: "Track active state in adapter-side control registry.",
          },
          "control.geolocate": {
            level: "emulated",
            summary: "Geolocate control requires adapter orchestration around browser geolocation.",
            fallback: "Bridge browser geolocation to map center and marker updates.",
          },
          "control.geolocate.tracking": {
            level: "emulated",
            summary: "Continuous tracking depends on watchPosition lifecycle management.",
            fallback: "Fallback to repeated locate-once requests when tracking is unavailable.",
          },
          "control.attribution": {
            level: "native",
            summary: "Attribution control maps to native copyright controls.",
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
    const definition = layer.toLayerDefinition();

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
    const definition = layer.toLayerDefinition();
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
    const definition = layer.toLayerDefinition();
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
    const definition = overlay.toOverlayDefinition();
    this.record(
      `[bmapgl] map.addOverlay("${overlay.id}", ${describeOverlayDefinition(definition, "bmapgl")})`,
    );
    this.syncOverlayRuntimeState(overlay);
    return { type: "overlay", id: overlay.id, kind: definition.kind };
  }

  public override updateOverlay(
    _mapHandle: unknown,
    overlay: AbstractOverlay,
    _overlayHandle: unknown,
  ): void {
    const definition = overlay.toOverlayDefinition();
    this.record(
      `[bmapgl] syncOverlay("${overlay.id}", ${describeOverlayDefinition(definition, "bmapgl")})`,
    );
    this.syncOverlayRuntimeState(overlay);
  }

  public override unmountOverlay(
    _mapHandle: unknown,
    overlay: AbstractOverlay,
    _overlayHandle: unknown,
  ): void {
    this.record(`[bmapgl] map.removeOverlay("${overlay.id}")`);
    this.clearOverlayRuntimeState(overlay.id);
  }

  public override mountControl(
    _mapHandle: unknown,
    control: AbstractControl,
  ): unknown {
    const definition = control.toControlDefinition();
    this.record(
      `[bmapgl] map.addControl("${control.id}", ${describeControlDefinition(definition)})`,
    );
    this.syncControlRuntimeState(_mapHandle, control);
    return { type: "control", id: control.id, kind: definition.kind };
  }

  public override updateControl(
    _mapHandle: unknown,
    control: AbstractControl,
    _controlHandle: unknown,
  ): void {
    const definition = control.toControlDefinition();
    this.record(
      `[bmapgl] syncControl("${control.id}", ${describeControlDefinition(definition)})`,
    );
    this.syncControlRuntimeState(_mapHandle, control);
  }

  public override unmountControl(
    _mapHandle: unknown,
    control: AbstractControl,
    _controlHandle: unknown,
  ): void {
    this.record(`[bmapgl] map.removeControl("${control.id}")`);
    this.clearControlRuntimeState(control.id);
  }
}
