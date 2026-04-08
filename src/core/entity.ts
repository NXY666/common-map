import {
	type EmptyEventMap,
	type EntityState,
	type EntityEvent,
	type EventMapBase,
	type EventPayload,
	type EventType,
	type MapEntitySnapshot,
	TypedEvented,
} from "./events";
import {type EntityLifecycleAccess, hasEntityLifecycleAccess,} from "./internal-lifecycle";
import {adapterEventEmitterSymbol} from "./internal-event-bridge";
import type {AbstractMap} from "./map";

export abstract class AbstractMapEntity<
	TOptions extends object,
	TNativeHandle = unknown,
	TExtraEvents extends EventMapBase = EmptyEventMap
> extends TypedEvented<EntityEvent<TOptions, TExtraEvents>> {
	public readonly id: string;

	protected optionsValue: TOptions;

	protected stateValue: EntityState = "detached";

	protected ownerMap?: AbstractMap;

	protected nativeHandle?: TNativeHandle;

	protected constructor(id: string, initialOptions: TOptions) {
		super();
		this.id = id;
		this.optionsValue = initialOptions;
	}

	public get options(): Readonly<TOptions> {
		return this.optionsValue;
	}

	public get state(): EntityState {
		return this.stateValue;
	}

	public get map(): AbstractMap | undefined {
		return this.ownerMap;
	}

	public getNativeHandle(): TNativeHandle | undefined {
		return this.nativeHandle;
	}

	public isMounted(): boolean {
		return this.stateValue === "mounted";
	}

	public isRegistered(): boolean {
		return this.stateValue === "registered" || this.stateValue === "mounted";
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

	public attach(
		map: AbstractMap,
		nativeHandle: TNativeHandle,
		access: EntityLifecycleAccess,
	): this {
		this.assertLifecycleAccess(access);
		this.ensureMutable();

		if (this.ownerMap !== map || this.stateValue === "detached") {
			throw new Error(
				`Entity "${this.id}" must be registered on map "${map.id}" before mounting.`,
			);
		}

		if (this.stateValue === "mounted") {
			throw new Error(`Entity "${this.id}" is already mounted.`);
		}

		this.nativeHandle = nativeHandle;
		this.stateValue = "mounted";
		this.fire("mounted", this.snapshot());
		return this;
	}

	public register(
		map: AbstractMap,
		access: EntityLifecycleAccess,
	): this {
		this.assertLifecycleAccess(access);
		this.ensureMutable();

		if (this.ownerMap && this.ownerMap !== map) {
			throw new Error(`Entity "${this.id}" is already registered on another map.`);
		}

		if (this.stateValue === "mounted" && this.ownerMap === map) {
			return this;
		}

		this.ownerMap = map;
		this.stateValue = "registered";
		return this;
	}

	public detach(access: EntityLifecycleAccess): this {
		this.assertLifecycleAccess(access);

		if (this.stateValue !== "mounted") {
			return this;
		}

		this.stateValue = "registered";
		this.nativeHandle = undefined;
		this.fire("unmounted", this.snapshot());
		return this;
	}

	public unregister(access: EntityLifecycleAccess): this {
		this.assertLifecycleAccess(access);

		if (this.stateValue === "mounted") {
			throw new Error(
				`Entity "${this.id}" is still mounted and cannot be unregistered directly.`,
			);
		}

		if (this.stateValue === "detached") {
			return this;
		}

		this.ownerMap = undefined;
		this.nativeHandle = undefined;
		this.stateValue = "detached";
		return this;
	}

	public dispose(): this {
		if (this.stateValue === "disposed") {
			return this;
		}

		if (this.isRegistered()) {
			throw new Error(
				`Entity "${this.id}" is still registered on map "${this.ownerMap?.id}". Remove it from the map before disposing.`,
			);
		}

		this.nativeHandle = undefined;
		this.ownerMap = undefined;
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
