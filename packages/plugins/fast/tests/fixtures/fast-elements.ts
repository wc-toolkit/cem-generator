import { FASTElement, attr, customElement } from "@microsoft/fast-element";

const importedStyles = `:host { /** Imported indicator color. */ --imported-indicator-color: blue; }`;
const FAST_PAGE_SIZE = 10;
const FAST_MODE = "compact" as const;
let fastMutableDefault = 4;

function makeFastDefault() {
  return 2;
}

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
    const template = `<!-- Indicator --> <div part="indicator"><!-- Label --><slot name="label"></slot><!-- Default --><slot></slot></div>`;
    const styles = `:host { /** Indicator color. */ --indicator-color: green; }`;
  }
}

export class BaseFastElement extends FASTElement {
  baseMethod() {}
}

export class DerivedFastElement extends BaseFastElement {
  ownMethod() {}
}

@customElement("imported-styles-fast-element")
export class ImportedStylesFastElement extends FASTElement {
  static styles = importedStyles;
}

@customElement("fast-default-values")
export class FastDefaultValues extends FASTElement {
  @attr({ attribute: "page-size" }) pageSize = FAST_PAGE_SIZE;
  @attr mode = FAST_MODE;
  @attr enabled = false;
  @attr nullable = null;
  @attr values = [];
  @attr options = {};
  @attr createdAt = new Date(0);
  @attr computed = makeFastDefault();
  @attr mutable = fastMutableDefault;
  @attr missing = undefined;
}
