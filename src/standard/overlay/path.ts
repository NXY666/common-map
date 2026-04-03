import type {EmptyEventMap, EventMapBase} from "@/core/events";
import type {LngLatLike} from "@/core/types";
import {AbstractStandardOverlay} from "./base";
import type {PathOverlayEventMap, PathOverlayOptions, StandardOverlayDefinition,} from "./types";

export abstract class AbstractPathOverlay<
  TOptions extends PathOverlayOptions,
  TDefinition extends StandardOverlayDefinition,
  TExtraEvents extends EventMapBase = EmptyEventMap,
  TOverlayHandle = unknown,
> extends AbstractStandardOverlay<
  TOptions,
  TDefinition,
  PathOverlayEventMap & Omit<TExtraEvents, keyof PathOverlayEventMap>,
  TOverlayHandle
> {
  public get coordinates(): readonly LngLatLike[] {
    return this.options.coordinates;
  }

  public setCoordinates(coordinates: readonly LngLatLike[]): this {
    this.patchOptions({ coordinates } as Partial<TOptions>);
    this.fire("coordinatesChanged", { id: this.id, coordinates } as never);
    return this;
  }

  public appendCoordinate(coordinate: LngLatLike): this {
    return this.setCoordinates([...this.coordinates, coordinate]);
  }

  public prependCoordinate(coordinate: LngLatLike): this {
    return this.setCoordinates([coordinate, ...this.coordinates]);
  }

  public insertCoordinate(index: number, coordinate: LngLatLike): this {
    if (index < 0 || index > this.coordinates.length) {
      throw new RangeError(
        `insertCoordinate index ${index} is out of bounds for length ${this.coordinates.length}.`,
      );
    }

    const next = [...this.coordinates];
    next.splice(index, 0, coordinate);
    return this.setCoordinates(next);
  }

  public replaceCoordinate(index: number, coordinate: LngLatLike): this {
    if (index < 0 || index >= this.coordinates.length) {
      throw new RangeError(
        `replaceCoordinate index ${index} is out of bounds for length ${this.coordinates.length}.`,
      );
    }

    const next = [...this.coordinates];
    next[index] = coordinate;
    return this.setCoordinates(next);
  }

  public removeCoordinate(index: number): this {
    if (index < 0 || index >= this.coordinates.length) {
      throw new RangeError(
        `removeCoordinate index ${index} is out of bounds for length ${this.coordinates.length}.`,
      );
    }

    const next = [...this.coordinates];
    next.splice(index, 1);
    return this.setCoordinates(next);
  }

  public clearCoordinates(): this {
    return this.setCoordinates([]);
  }
}
