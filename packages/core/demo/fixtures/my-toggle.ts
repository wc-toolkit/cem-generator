type ToggleVariant = "primary" | "secondary" | "danger";
type ToggleSize = "sm" | "md" | "lg" | undefined;

/**
 * Toggle control for binary state.
 * @summary Typed TS custom element example
 * @tag my-toggle
 * @slot label - Label content rendered next to the control
 * @cssprop --toggle-track-color - Track color token
 * @csspart knob - Styles the visual knob
 * @cssState checked - Applied when toggle is checked
 * @event {CustomEvent<boolean>} toggled - Fired when checked value changes
 * @deprecated Prefer `<my-switch>` in new code.
 */
export class MyToggle extends HTMLElement {
  static observedAttributes = ["checked", "disabled"];

  /**
   * Whether the toggle is checked.
   * @attribute
   * @default false
   */
  checked: boolean = false;

  /**
   * @attribute
   */
  disabled?: boolean;

  /**
   * Visual treatment for the toggle.
   */
  variant: ToggleVariant = "primary";

  /**
   * Size token for rendering density.
   */
  size?: ToggleSize;

  /**
   * @summary Programmatically flips state
   * @deprecated Use `setChecked` for explicit state.
   */
  public toggle(next?: boolean): boolean {
    this.checked = typeof next === "boolean" ? next : !this.checked;
    return this.checked;
  }

  protected setChecked(value: boolean): void {
    this.checked = value;
  }
}

customElements.define("my-toggle", MyToggle);
