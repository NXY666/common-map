import type {AbstractMap} from "./map";

declare const entityLifecycleBrand: unique symbol;

export interface EntityLifecycleAccess {
	readonly [entityLifecycleBrand]: true;
}

interface ManagedEntity<TNativeHandle = unknown> {
	readonly id: string;

	isDisposed(): boolean;

	isMounted(): boolean;

	register(map: AbstractMap, access: EntityLifecycleAccess): void;

	unregister(access: EntityLifecycleAccess): void;

	attach(
		map: AbstractMap,
		nativeHandle: TNativeHandle,
		access: EntityLifecycleAccess,
	): void;

	detach(access: EntityLifecycleAccess): void;
}

const lifecycleAccess = {} as EntityLifecycleAccess;

export function hasEntityLifecycleAccess(
	access: unknown,
): access is EntityLifecycleAccess {
	return access === lifecycleAccess;
}

export function registerManagedEntity(
	entity: ManagedEntity,
	map: AbstractMap,
): void {
	if (entity.isDisposed()) {
		throw new Error(`Entity "${entity.id}" has been disposed.`);
	}

	entity.register(map, lifecycleAccess);
}

export function unregisterManagedEntity(entity: ManagedEntity): void {
	if (entity.isDisposed()) {
		return;
	}

	entity.unregister(lifecycleAccess);
}

export function mountManagedEntity<TNativeHandle>(
	entity: ManagedEntity<TNativeHandle>,
	map: AbstractMap,
	nativeHandle: TNativeHandle,
): void {
	entity.attach(map, nativeHandle, lifecycleAccess);
}

export function unmountManagedEntity(entity: ManagedEntity): void {
	entity.detach(lifecycleAccess);
}
