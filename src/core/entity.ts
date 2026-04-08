import {
	type EmptyEventMap,
	type EntityEvent,
	type EventMapBase,
	type EventPayload,
	type EventType,
	type LifecycleState,
	type MapEntitySnapshot,
	TypedEvented,
} from "./events";
import {type EntityLifecycleAccess, getManagedMap, hasEntityLifecycleAccess,} from "./internal-lifecycle";
import {adapterEventEmitterSymbol} from "./internal-event-bridge";
import type {AbstractMap} from "./map";

export abstract class AbstractMapEntity<
	TOptions extends object,
	TNativeHandle = unknown,
	TExtraEvents extends EventMapBase = EmptyEventMap
> extends TypedEvented<EntityEvent<TOptions, TExtraEvents>> {
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

	public get options(): Readonly<TOptions> {
		return this.optionsValue;
	}

	public get state(): LifecycleState {
		return this.stateValue;
	}

	public get mountedMap(): AbstractMap | undefined {
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

	public [adapterEventEmitterSymbol]<
		K extends EventType<TExtraEvents>,
	>(
		type: K,
		payload?: EventPayload<TExtraEvents, K>,
	): this {
		return super.fire(
			type as EventType<EntityEvent<TOptions, TExtraEvents>>,
			payload as
				| EventPayload<
				EntityEvent<TOptions, TExtraEvents>,
				EventType<EntityEvent<TOptions, TExtraEvents>>
			>
				| undefined,
		);
	}

	protected setOptions<TKey extends keyof TOptions>(
		key: TKey,
		value: TOptions[TKey],
	): this {
		this.ensureMutable();

		const patch: object = {
			[key]: value,
		};

		this.optionsValue = {
			...this.optionsValue,
			[key]: value,
		} as TOptions;
		this.emitUpdated(patch as Partial<TOptions>);
		return this;
	}

	public attachToMap(
		map: AbstractMap,
		nativeHandle: TNativeHandle,
		access: EntityLifecycleAccess,
	): this {
		// 仅允许已托管实体进入 mounted
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

	protected touch(patch: Partial<TOptions> = {}): this {
		this.ensureMutable();
		this.emitUpdated(patch);

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
		// updated 事件同时携带快照和补丁
		this.fire("updated", {
			...this.snapshot(),
			patch
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
