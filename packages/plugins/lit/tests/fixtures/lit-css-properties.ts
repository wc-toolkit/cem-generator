import { LitElement, css, html } from "lit";

/**
 * @cssprop --jsdoc-only - Documented by JSDoc only
 * @csspart icon - Icon glyph wrapper part
 */
export class LitCssPropsEl extends LitElement {
  static styles = css`
    /** Surface color contract for host themes. */
    @property --surface-color {
      syntax: "<color>";
      initial-value: teal;
      inherits: false;
    }

    :host {
      /** Host spacing token for outer layout. */
      --host-spacing: 2px;
    }

    .inner {
      color: var(--usage-only, red);
      margin: var(--host-spacing);
    }
  `;

  render() {
    return html`
      <!-- Primary button chrome -->
      <button part="button"><span part="icon button"></span></button>
    `;
  }
}
