import type {AbstractMap} from "./map";

declare const entityLifecycleBrand: unique symbol;

export interface EntityLifecycleAccess {
	readonly [entityLifecycleBrand]: true;
}

interface LifecycleManagedEntity<TNativeHandle = unknown> {
	readonly id: string;

	isDisposed(): boolean;

	isMounted(): boolean;

	attachToMap(
		map: AbstractMap,
		nativeHandle: TNativeHandle,
		access: EntityLifecycleAccess,
	): void;

	detachFromMap(access: EntityLifecycleAccess): void;
}

const lifecycleAccess = {} as EntityLifecycleAccess;
const managedEntities = new WeakMap<object, AbstractMap>();

export function hasEntityLifecycleAccess(
	access: unknown,
): access is EntityLifecycleAccess {
	return access === lifecycleAccess;
}

export function getManagedMap(entity: object): AbstractMap | undefined {
	return managedEntities.get(entity);
}

export function bindManagedEntity(
	entity: LifecycleManagedEntity,
	map: AbstractMap,
): void {
	if (entity.isDisposed()) {
		throw new Error(`Entity "${entity.id}" has been disposed.`);
	}

	const existingMap = managedEntities.get(entity);
	if (existingMap && existingMap !== map) {
		throw new Error(
			`Entity "${entity.id}" is already managed by another map instance.`,
		);
	}

	if (!existingMap) {
		managedEntities.set(entity, map);
	}
}

export function releaseManagedEntity(
	entity: LifecycleManagedEntity,
	map: AbstractMap,
): void {
	const existingMap = managedEntities.get(entity);
	if (!existingMap) {
		return;
	}

	if (existingMap !== map) {
		throw new Error(
			`Entity "${entity.id}" is managed by another map instance.`,
		);
	}

	if (entity.isMounted()) {
		throw new Error(
			`Entity "${entity.id}" is still mounted and cannot be released directly.`,
		);
	}

	managedEntities.delete(entity);
}

export function mountManagedEntity<TNativeHandle>(
	entity: LifecycleManagedEntity<TNativeHandle>,
	map: AbstractMap,
	nativeHandle: TNativeHandle,
): void {
	entity.attachToMap(map, nativeHandle, lifecycleAccess);
}

export function unmountManagedEntity(entity: LifecycleManagedEntity): void {
	entity.detachFromMap(lifecycleAccess);
}
