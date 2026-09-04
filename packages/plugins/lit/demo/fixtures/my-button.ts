import { LitElement, html, css } from "lit";
import { property, state } from "lit/decorators.js";

/**
 * A button component.
 * @csspart icon - Styles the icon inside the button
 */
export class MyButton extends LitElement {
  static styles = css`
    /** Foreground token contract for host styling. */
    @property --my-button-fg {
      syntax: "<color>";
      initial-value: white;
      inherits: true;
    }

    :host {
      /** Background token contract for host styling. */
      --my-button-bg: steelblue;
    }

    button {
      background: var(--my-button-bg, blue);
    }
  `;

  /** The button's visual variant. */
  @property({ type: String })
  variant = "primary";

  @state()
  private pressed = false;

  render() {
    return html`
      <!-- Primary button chrome -->
      <button part="button"><span part="icon"></span>Click me</button>
    `;
  }
}
