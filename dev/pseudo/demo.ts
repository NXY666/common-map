import {
	type DemoFeatureCollection,
	DemoFullscreenControl,
	DemoGeoJsonSource,
	DemoGeolocateControl,
	DemoLineLayer,
	DemoMap,
	DemoMarkerOverlay,
	DemoNavigationControl,
	DemoPopupOverlay,
} from "./demo-models";
import {PseudoBMapGLAdapter, PseudoMapLibreAdapter,} from "./pseudo-adapters";

export interface DemoResult {
  recommendedStructure: readonly string[];
  patterns: readonly string[];
  maplibreOperations: readonly string[];
  bmapOperations: readonly string[];
}

function createRouteData(): DemoFeatureCollection {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [
            [116.391, 39.907],
            [116.404, 39.915],
            [116.423, 39.927],
          ],
        },
        properties: {
          name: "demo-route",
        },
      },
    ],
  };
}

async function buildMapScenario(
  adapter: PseudoMapLibreAdapter | PseudoBMapGLAdapter,
) {
  const map = new DemoMap(
    {
      id: `${adapter.engine}-demo`,
      target: `#${adapter.engine}-container`,
      style:
        adapter.engine === "maplibre"
          ? "https://demotiles.maplibre.org/style.json"
          : null,
      interactive: true,
      initialView: {
        center: [116.404, 39.915],
        zoom: 11,
        bearing: 15,
        pitch: 35,
      },
    },
    adapter,
  );

  const source = new DemoGeoJsonSource("route-source", {
    data: createRouteData(),
    cluster: false,
    tolerance: 0.2,
  });

  const layer = new DemoLineLayer("route-line", {
    sourceId: "route-source",
    paint: {
      "line-color": "#0b57d0",
      "line-width": 4,
    },
    metadata: {
      semanticRole: "route",
    },
  });

  const overlay = new DemoMarkerOverlay("arrival-marker", {
    coordinate: [116.423, 39.927],
    color: "#d93025",
    label: "Arrival",
    zIndex: 3,
    visible: true,
  });

  const popup = new DemoPopupOverlay("arrival-popup", {
    coordinate: [116.423, 39.927],
    content: "Arrival point",
    open: false,
  });

  const control = new DemoNavigationControl("nav", {
    position: "top-right",
    showCompass: true,
    showZoom: true,
  });

  const fullscreen = new DemoFullscreenControl("fullscreen", {
    position: "top-right",
    active: false,
  });

  const geolocate = new DemoGeolocateControl("locate", {
    position: "top-right",
    tracking: false,
  });

  map.addSource(source);
  map.addLayer(layer);
  map.addOverlay(popup);
  map.addOverlay(overlay);
  map.addControl(control);
  map.addControl(fullscreen);
  map.addControl(geolocate);

	const registeredSource = map.getSource("route-source");
	const registeredLayer = map.getLayer("route-line");
	const registeredOverlay = map.getOverlay("arrival-marker");
	const registeredControl = map.getControl("nav");

	registeredSource?.getNativeHandle();
	registeredLayer?.setVisibility(true);
	registeredOverlay?.toOverlayDefinition();
	registeredControl?.toControlDefinition();

  await map.load();
  map.mount();

  source.setData(createRouteData());
  layer.setVisibility(true);
  overlay.bindPopup(popup);
  overlay.openPopup();
  overlay.closePopup();
  overlay.unbindPopup();
  overlay.setCoordinate([116.426, 39.929]);
  control.setPosition("bottom-right");
  fullscreen.enter();
  fullscreen.exit();
  geolocate.locateOnce();
  geolocate.startTracking();
  geolocate.stopTracking();
  map.setView({
    center: [116.41, 39.92],
    zoom: 12,
    bearing: 30,
    pitch: 45,
  });
  map.destroy();

  return adapter.getOperationLog();
}

export async function runArchitectureDemo(): Promise<DemoResult> {
  const maplibreAdapter = new PseudoMapLibreAdapter();
  const bmapAdapter = new PseudoBMapGLAdapter();

  return {
    recommendedStructure: [
      "src/core/types.ts",
      "src/core/events.ts",
      "src/core/capability.ts",
      "src/core/map.ts",
      "src/core/source.ts",
      "src/core/layer.ts",
      "src/core/overlay.ts",
      "src/core/control.ts",
      "src/core/adapter.ts",
      "src/standard/common/*.ts",
      "src/standard/overlay/*.ts",
      "src/standard/control/*.ts",
      "dev/pseudo/*.ts",
    ],
    patterns: [
      "Bridge: Map 只依赖 Adapter，不直接依赖 MapLibre / BMapGL SDK。",
      "Template Method: Source / Layer / Overlay / Control 通过 toDefinition() 暴露统一描述，再由 Adapter 落地。",
      "Capability Profile: 所有差异化能力先声明，再决定 none / emulated / native。",
      "Registry + Lifecycle: Map 统一管理注册、挂载、更新、销毁，避免对象自己到处持有引擎实例。",
    ],
    maplibreOperations: await buildMapScenario(maplibreAdapter),
    bmapOperations: await buildMapScenario(bmapAdapter),
  };
}

export function formatDemoResult(result: DemoResult): string {
  const sections = [
    "Map abstraction skeleton",
    "",
    "Recommended file structure:",
    ...result.recommendedStructure.map((item) => `- ${item}`),
    "",
    "Patterns:",
    ...result.patterns.map((item) => `- ${item}`),
    "",
    "Pseudo MapLibre flow:",
    ...result.maplibreOperations.map((item, index) => `${index + 1}. ${item}`),
    "",
    "Pseudo BMapGL flow:",
    ...result.bmapOperations.map((item, index) => `${index + 1}. ${item}`),
  ];

  return sections.join("\n");
}
