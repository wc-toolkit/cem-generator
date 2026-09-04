/**
 * A simple icon element.
 * @fires icon-loaded Fired once the icon's image has loaded
 */
export class MyIcon extends HTMLElement {
  static get observedAttributes() {
    return ["name", "size"];
  }

  /**
   * The icon's display size in pixels.
   */
  get size() {
    return this._size;
  }

  set size(value) {
    this._size = value;
  }

  /** Reloads the icon from its source. */
  refresh() {}
}

customElements.define("my-icon", MyIcon);
