import { FASTElement, attr, customElement } from "@microsoft/fast-element";

@customElement({ name: "name-tag" })
export class NameTag extends FASTElement {
  @attr greeting: string = "Hello";
  @attr({ attribute: "my-attr" }) bar = 1;
}

@customElement("boolean-test")
export class BooleanTest extends FASTElement {
  @attr normalAttr = "";
  @attr({ mode: "boolean" }) booleanAttr = false;
  @attr({ attribute: "customName", mode: "boolean" }) explicitName = false;

  connectedCallback() {}
  disconnectedCallback() {}
  attributeChangedCallback() {}
  $emit(_type: string, _detail?: unknown) {}

  activate() {
    this.$emit("button-activated", { source: this });
  }
}
