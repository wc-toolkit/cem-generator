/**
 * A simple icon element.
 * @summary Compact icon glyph wrapper
 * @tag my-icon
 * @slot - Default icon content
 * @cssprop --icon-size - Controls icon size token
 * @cssproperty [--icon-color=black] - Controls icon color token
 * @csspart glyph - Styles the rendered glyph part
 * @cssState loaded - Applied after icon data is ready
 * @event {CustomEvent} icon-loaded - Fired once icon data has loaded
 */
export class MyIcon extends HTMLElement {
  static get observedAttributes() {
    return ["name", "size"];
  }

  /**
   * The icon's display size in pixels.
   * @attribute
   * @default 16
   */
  get size() {
    return this._size;
  }

  set size(value) {
    this._size = value;
  }

  /**
   * @summary Visual style mode
   * @attribute
   * @deprecated Use the `name` attribute instead.
   */
  mode = "filled";

  /**
   * @internal
   */
  internalCounter = 0;

  /** Reloads the icon from its source. */
  refresh() {}
}

customElements.define("my-icon", MyIcon);
