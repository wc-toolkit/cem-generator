import { FASTElement, attr, customElement } from "@microsoft/fast-element";

/** A FAST button component. */
@customElement("demo-button")
export class MyButton extends FASTElement {
  /** The button label. */
  @attr label = "Click me";

  /** Disables interaction with the button. */
  @attr({ mode: "boolean" }) disabled = false;

  /** Maps to a project-specific HTML attribute. */
  @attr({ attribute: "button-variant" }) variant = "primary";

  /** Dispatches the button's activation event. */
  activate() {
    this.dispatchEvent(new CustomEvent("button-activated"));
  }
}
