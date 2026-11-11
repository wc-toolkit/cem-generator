import { LitElement } from "lit";
import { property } from "lit/decorators.js";

export class LitAccessorPropertiesElement extends LitElement {
  private _label = "";
  private _count = 0;

  get label(): string {
    return this._label;
  }

  /** Accessible label. */
  @property({ attribute: "label-text", reflect: true })
  set label(value: string) {
    this._label = value;
  }

  get count(): number {
    return this._count;
  }

  /** Number of items. */
  @property({ attribute: "item-count", type: Number })
  set count(value: number) {
    this._count = value;
  }

  @property({ attribute: false })
  get internalToken(): string {
    return "internal";
  }
}
