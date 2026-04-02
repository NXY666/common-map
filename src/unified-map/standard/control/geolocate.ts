import { AbstractStandardControl } from "./base";
import { MAP_CAPABILITY_KEYS } from "../../core/capability";
import type {
  GeolocateControlDefinition,
  GeolocateControlEventMap,
  GeolocateControlOptions,
} from "./types";

export abstract class AbstractGeolocateControl<
  TOptions extends GeolocateControlOptions = GeolocateControlOptions,
  TControlHandle = unknown,
> extends AbstractStandardControl<
  TOptions,
  GeolocateControlDefinition,
  GeolocateControlEventMap,
  TControlHandle
> {
  public readonly kind = "geolocate" as const;
  public readonly meta = {
    renderLayer: "control-dom",
    interactionLayer: "dom",
    description:
      "一个发起定位、显示用户位置并可切换持续跟踪的状态型控件，表达的是定位请求与跟踪状态。",
  } as const;

  public get tracking(): boolean {
    return this.options.tracking ?? false;
  }

  public setTracking(tracking: boolean): this {
    if (tracking) {
      this.assertCapability(MAP_CAPABILITY_KEYS.control.geolocateTracking);
    }

    if (tracking === this.tracking) {
      return this;
    }

    this.patchOptions({ tracking } as Partial<TOptions>);
    this.fire("trackingChanged", { id: this.id, tracking });
    return this;
  }

  public startTracking(): this {
    return this.setTracking(true);
  }

  public stopTracking(): this {
    return this.setTracking(false);
  }

  public toggleTracking(): this {
    return this.setTracking(!this.tracking);
  }

  public locateOnce(): this {
    const locateRequestVersion = (this.options.locateRequestVersion ?? 0) + 1;
    this.patchOptions({ locateRequestVersion } as Partial<TOptions>);
    return this;
  }

  public setShowUserLocation(showUserLocation: boolean): this {
    this.patchOptions({ showUserLocation } as Partial<TOptions>);
    return this;
  }

  public setShowAccuracyCircle(showAccuracyCircle: boolean): this {
    this.patchOptions({ showAccuracyCircle } as Partial<TOptions>);
    return this;
  }

  public setPositionOptions(positionOptions: PositionOptions | undefined): this {
    this.patchOptions({ positionOptions } as Partial<TOptions>);
    return this;
  }

  public setFitBoundsMaxZoom(fitBoundsMaxZoom: number | undefined): this {
    this.patchOptions({ fitBoundsMaxZoom } as Partial<TOptions>);
    return this;
  }

  public toStandardControlDefinition(): GeolocateControlDefinition {
    return {
      id: this.id,
      kind: this.kind,
      position: this.position,
      visible: this.visible,
      options: this.options,
      metadata: this.options.metadata,
    };
  }
}
