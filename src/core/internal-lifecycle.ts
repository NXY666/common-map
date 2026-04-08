import type {AbstractMap} from "./map";

declare const entityLifecycleBrand: unique symbol;

export interface EntityLifecycleAccess {
	readonly [entityLifecycleBrand]: true;
}

interface ManagedEntity<TNativeHandle = unknown> {
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

// 使用访问令牌和 WeakMap 管理生命周期入口
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
	entity: ManagedEntity,
	map: AbstractMap,
): void {
	// 同一实体只能绑定到一个 map
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
	entity: ManagedEntity,
	map: AbstractMap,
): void {
	// release 前要求实体已卸载
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
	entity: ManagedEntity<TNativeHandle>,
	map: AbstractMap,
	nativeHandle: TNativeHandle,
): void {
	entity.attachToMap(map, nativeHandle, lifecycleAccess);
}

export function unmountManagedEntity(entity: ManagedEntity): void {
	entity.detachFromMap(lifecycleAccess);
}
