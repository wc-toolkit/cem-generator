import { LitElement } from "lit";
import { property } from "lit/decorators.js";

export class LitPropertyDefaultsElement extends LitElement {
  /** Number of items. */
  @property({ type: Number })
  count = 2;

  @property({ attribute: "basic-label" })
  label = "Basic label";

  @property({ type: Boolean })
  enabled = false;

  @property({ type: Array })
  values = ["a"];

  @property()
  createdAt = new Date(0);

  /** @default "documented" */
  @property()
  documented = "initializer";
}

customElements.define("lit-property-defaults", LitPropertyDefaultsElement);
