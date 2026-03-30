import {
  DemoGeoJsonSource,
  DemoLineLayer,
  DemoMap,
  DemoMarkerOverlay,
  DemoNavigationControl,
  type DemoFeatureCollection,
} from "./demo-models";
import {
  PseudoBMapGLAdapter,
  PseudoMapLibreAdapter,
} from "./pseudo-adapters";

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

  const control = new DemoNavigationControl("nav", {
    position: "top-right",
    compass: true,
    showZoom: true,
  });

  map.addSource(source);
  map.addLayer(layer);
  map.addOverlay(overlay);
  map.addControl(control);
  await map.load();
  map.mount();

  source.setData(createRouteData());
  layer.setVisibility(true);
  overlay.setCoordinate([116.426, 39.929]);
  control.setPosition("bottom-right");
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
      "src/unified-map/core/types.ts",
      "src/unified-map/core/events.ts",
      "src/unified-map/core/capability.ts",
      "src/unified-map/core/map.ts",
      "src/unified-map/core/source.ts",
      "src/unified-map/core/layer.ts",
      "src/unified-map/core/overlay.ts",
      "src/unified-map/core/control.ts",
      "src/unified-map/core/adapter.ts",
      "src/unified-map/pseudo/*.ts",
    ],
    patterns: [
      "Bridge: Map 只依赖 Adapter，不直接依赖 MapLibre / BMapGL SDK。",
      "Template Method: Source / Layer / Overlay / Control 通过 toDefinition() 暴露统一描述，再由 Adapter 落地。",
      "Capability Profile: 所有差异化能力先声明，再决定 native / emulated / unsupported。",
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
