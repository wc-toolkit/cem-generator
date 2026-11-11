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

/**
 * Documentation can live on either half of the accessor pair, independently
 * of the declaration that carries the decorator.
 */
export class LitAccessorDocsElement extends LitElement {
  private _note = "";
  private _mode = "compact";

  /** Documented on the getter. */
  get note(): string {
    return this._note;
  }

  @property({ attribute: "note-text" })
  set note(value: string) {
    this._note = value;
  }

  /**
   * Documented on the setter.
   * @summary Stored mode.
   * @deprecated Use `note` instead.
   */
  set mode(value: string) {
    this._mode = value;
  }

  @property()
  get mode(): string {
    return this._mode;
  }
}
