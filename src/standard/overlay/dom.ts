import type {EmptyEventMap} from "@/core/events";
import {AbstractAnchoredOverlay} from "./anchored";
import type {DomContentLike, DomOverlayDefinition, DomOverlayOptions,} from "./types";

export abstract class AbstractDomOverlay<
  TOptions extends DomOverlayOptions = DomOverlayOptions,
  TOverlayHandle = unknown,
> extends AbstractAnchoredOverlay<
  TOptions,
  DomOverlayDefinition,
  EmptyEventMap,
  TOverlayHandle
> {
  public readonly kind = "dom" as const;
  public readonly meta = {
    renderLayer: "dom-overlay",
    interactionLayer: "dom",
    description:
      "一个绑定到地理坐标的通用 DOM 容器，用于承载自定义 HTML 结构、复杂状态展示或业务组件。",
  } as const;

  public setContent(content: DomContentLike): this {
    this.patchOptions({ content } as Partial<TOptions>);
    return this;
  }

  public setClassName(className: string | undefined): this {
    this.patchOptions({ className } as Partial<TOptions>);
    return this;
  }

  public addClassName(className: string): this {
    const current = this.options.className?.trim();
    const next = current ? `${current} ${className}` : className;
    return this.setClassName(next);
  }

  public removeClassName(className: string): this {
    const next = (this.options.className ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .filter((item) => item !== className)
      .join(" ");
    return this.setClassName(next || undefined);
  }

  public setInteractive(interactive: boolean): this {
    this.patchOptions({ interactive } as Partial<TOptions>);
    return this;
  }

  public setRotation(rotation: number | undefined): this {
    this.patchOptions({ rotation } as Partial<TOptions>);
    return this;
  }

  public toStandardOverlayDefinition(): DomOverlayDefinition {
    return {
      id: this.id,
      kind: this.kind,
      visible: this.visible,
      zIndex: this.zIndex,
      options: this.options,
      metadata: this.options.metadata,
    };
  }
}
