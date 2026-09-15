import { LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import { importedStyles } from "./imported-styles.js";

@customElement("imported-styles-element")
export class ImportedStylesElement extends LitElement {
  static styles = importedStyles;
}
