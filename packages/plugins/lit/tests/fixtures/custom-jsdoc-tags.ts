import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";

/**
 * A Lit element documented with a custom JSDoc tag.
 * @owner design-system
 */
@customElement("custom-jsdoc-tags")
export class CustomJsDocTagsElement extends LitElement {
  render() {
    return html`<slot></slot>`;
  }
}
