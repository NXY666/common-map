import {
  TypedEvented,
  type EmptyEventMap,
  type EntityEventMap,
  type EventKey,
  type EventPayload,
  type EventMapBase,
  type LifecycleState,
  type MapEntityEventMap,
  type MapEntitySnapshot,
} from "./events";
import {
  getManagedMap,
  hasEntityLifecycleAccess,
  type EntityLifecycleAccess,
} from "./internal-lifecycle";
import {
  hasAdapterEventAccess,
  type AdapterEventAccess,
} from "./internal-events";
import type { AbstractMap } from "./map";

export abstract class AbstractMapEntity<
  TOptions extends object,
  TNativeHandle = unknown,
  TExtraEvents extends EventMapBase = EmptyEventMap,
> extends TypedEvented<EntityEventMap<TOptions, TExtraEvents>> {
  public readonly id: string;

  protected optionsValue: TOptions;
  protected stateValue: LifecycleState = "draft";
  protected mapRef?: AbstractMap;
  protected nativeHandle?: TNativeHandle;

  protected constructor(id: string, initialOptions: TOptions) {
    super();
    this.id = id;
    this.optionsValue = initialOptions;
  }

  protected fire<K extends EventKey<MapEntityEventMap<TOptions>>>(
    type: K,
    payload?: EventPayload<MapEntityEventMap<TOptions>, K>,
  ): this;
  protected fire<K extends EventKey<EntityEventMap<TOptions, TExtraEvents>>>(
    type: K,
    payload?: EventPayload<EntityEventMap<TOptions, TExtraEvents>, K>,
  ): this;
  protected override fire<K extends EventKey<EntityEventMap<TOptions, TExtraEvents>>>(
    type: K,
    payload?: EventPayload<EntityEventMap<TOptions, TExtraEvents>, K>,
  ): this {
    return super.fire(type, payload);
  }

  public get options(): Readonly<TOptions> {
    return this.optionsValue;
  }

  public get state(): LifecycleState {
    return this.stateValue;
  }

  public get attachedMap(): AbstractMap | undefined {
    return this.mapRef;
  }

  public get managingMap(): AbstractMap | undefined {
    return getManagedMap(this);
  }

  public getNativeHandle(): TNativeHandle | undefined {
    return this.nativeHandle;
  }

  public isMounted(): boolean {
    return this.stateValue === "mounted";
  }

  public isDisposed(): boolean {
    return this.stateValue === "disposed";
  }

  public emitFromAdapter<
    K extends EventKey<EntityEventMap<TOptions, TExtraEvents>>,
  >(
    type: K,
    payload: EventPayload<EntityEventMap<TOptions, TExtraEvents>, K> | undefined,
    access: AdapterEventAccess,
  ): this {
    if (!hasAdapterEventAccess(access)) {
      throw new Error(
        `Entity "${this.id}" interaction events can only be emitted by an adapter bridge.`,
      );
    }

    return this.fire(type, payload);
  }

  public patchOptions(patch: Partial<TOptions>): this {
    this.ensureMutable();
    this.optionsValue = {
      ...this.optionsValue,
      ...patch,
    };

    this.emitUpdated(patch);

    return this;
  }

  protected touch(patch: Partial<TOptions> = {}): this {
    this.ensureMutable();
    this.emitUpdated(patch);

    return this;
  }

  public attachToMap(
    map: AbstractMap,
    nativeHandle: TNativeHandle,
    access: EntityLifecycleAccess,
  ): this {
    this.assertLifecycleAccess(access);
    this.ensureMutable();

    if (this.managingMap !== map) {
      throw new Error(
        `Entity "${this.id}" must be registered on map "${map.id}" before mounting.`,
      );
    }

    if (this.stateValue === "mounted") {
      throw new Error(`Entity "${this.id}" is already mounted.`);
    }

    this.mapRef = map;
    this.nativeHandle = nativeHandle;
    this.stateValue = "mounted";
    this.fire("mounted", this.snapshot());
    return this;
  }

  public detachFromMap(access: EntityLifecycleAccess): this {
    this.assertLifecycleAccess(access);

    if (this.stateValue !== "mounted") {
      return this;
    }

    this.stateValue = "draft";
    this.nativeHandle = undefined;
    this.mapRef = undefined;
    this.fire("unmounted", this.snapshot());
    return this;
  }

  public dispose(): this {
    if (this.stateValue === "disposed") {
      return this;
    }

    const managingMap = this.managingMap;
    if (managingMap) {
      throw new Error(
        `Entity "${this.id}" is still managed by map "${managingMap.id}". Remove it from the map before disposing.`,
      );
    }

    this.nativeHandle = undefined;
    this.mapRef = undefined;
    this.stateValue = "disposed";
    return this;
  }

  protected snapshot(): MapEntitySnapshot<TOptions> {
    return {
      id: this.id,
      state: this.stateValue,
      options: this.optionsValue,
    };
  }

  protected ensureMutable(): void {
    if (this.stateValue === "disposed") {
      throw new Error(`Entity "${this.id}" has been disposed.`);
    }
  }

  private emitUpdated(patch: Partial<TOptions>): void {
    this.fire("updated", {
      ...this.snapshot(),
      patch,
    });
  }

  private assertLifecycleAccess(access: unknown): void {
    if (!hasEntityLifecycleAccess(access)) {
      throw new Error(
        `Entity "${this.id}" lifecycle is managed by AbstractMap.`,
      );
    }
  }
}
