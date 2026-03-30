export type CapabilityLevel = "none" | "emulated" | "native";

export type MapCapability =
  | "camera.bearing"
  | "camera.pitch"
  | "style.swap"
  | "source.management"
  | "layer.management"
  | "overlay.dom"
  | "overlay.vector"
  | "control.custom"
  | "projection.screen"
  | "events.map-mouse"
  | "events.map-touch"
  | "events.layer-mouse"
  | "events.layer-touch"
  | "events.overlay-mouse"
  | "events.overlay-touch"
  | "events.overlay-drag"
  | "events.keyboard"
  | "query.features"
  | "cluster.geojson"
  | "terrain";

export interface CapabilityDescriptor {
  level: CapabilityLevel;
  summary: string;
  fallback?: string;
}

const levelRank: Record<CapabilityLevel, number> = {
  none: 0,
  emulated: 1,
  native: 2,
};

export abstract class AbstractCapabilityProfile<
  TCapability extends string = MapCapability,
> {
  public abstract readonly engine: string;
  protected abstract readonly capabilityTable: Readonly<
    Record<TCapability, CapabilityDescriptor>
  >;

  public get(capability: TCapability): CapabilityDescriptor {
    return (
      this.capabilityTable[capability] ?? {
        level: "none",
        summary: `Capability "${capability}" is not declared.`,
      }
    );
  }

  public supports(
    capability: TCapability,
    minimum: CapabilityLevel = "emulated",
  ): boolean {
    return levelRank[this.get(capability).level] >= levelRank[minimum];
  }

  public assert(
    capability: TCapability,
    minimum: CapabilityLevel = "emulated",
  ): void {
    if (!this.supports(capability, minimum)) {
      const descriptor = this.get(capability);
      const fallback = descriptor.fallback
        ? ` Fallback: ${descriptor.fallback}`
        : "";
      throw new Error(
        `[${this.engine}] does not satisfy capability "${capability}" at level "${minimum}".${fallback}`,
      );
    }
  }

  public list(): Array<[TCapability, CapabilityDescriptor]> {
    return Object.entries(this.capabilityTable) as Array<
      [TCapability, CapabilityDescriptor]
    >;
  }
}

export class StaticCapabilityProfile extends AbstractCapabilityProfile {
  public readonly engine: string;
  protected readonly capabilityTable: Readonly<
    Record<MapCapability, CapabilityDescriptor>
  >;

  public constructor(
    engine: string,
    capabilityTable: Readonly<Record<MapCapability, CapabilityDescriptor>>,
  ) {
    super();
    this.engine = engine;
    this.capabilityTable = capabilityTable;
  }
}
