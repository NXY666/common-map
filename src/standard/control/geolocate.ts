import {AbstractStandardControl} from "./base";
import {mapCapabilityKeys} from "@/core/capability";
import type {GeolocateControlDefinition, GeolocateControlEvent, GeolocateControlOptions,} from "./types";

export abstract class AbstractGeolocateControl<
	TOptions extends GeolocateControlOptions = GeolocateControlOptions,
	TControlHandle = unknown,
> extends AbstractStandardControl<
	TOptions,
	GeolocateControlDefinition,
	GeolocateControlEvent,
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
			this.assertCapability(mapCapabilityKeys.control.geolocateTracking);
		}

		if (tracking === this.tracking) {
			return this;
		}

		return this.setOptions("tracking", tracking);
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
		// 递增版本号以表达新的定位请求
		const locateRequestVersion = (this.options.locateRequestVersion ?? 0) + 1;
		this.setOptions("locateRequestVersion", locateRequestVersion);
		return this;
	}

	public setShowUserLocation(showUserLocation: boolean): this {
		this.setOptions("showUserLocation", showUserLocation);
		return this;
	}

	public setShowAccuracyCircle(showAccuracyCircle: boolean): this {
		this.setOptions("showAccuracyCircle", showAccuracyCircle);
		return this;
	}

	public setPositionOptions(positionOptions: PositionOptions | undefined): this {
		this.setOptions("positionOptions", positionOptions);
		return this;
	}

	public setFitBoundsMaxZoom(fitBoundsMaxZoom: number | undefined): this {
		this.setOptions("fitBoundsMaxZoom", fitBoundsMaxZoom);
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
