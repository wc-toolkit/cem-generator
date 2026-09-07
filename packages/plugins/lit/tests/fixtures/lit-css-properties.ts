import { LitElement, css, html } from "lit";
import { customElement, property as prop, state } from "lit/decorators.js";
import { externalMixin } from "./mixins.js";
import { SURFACE_CHANGED_EVENT } from "./events.js";

/**
 * @cssprop --jsdoc-only - Documented by JSDoc only
 * @csspart icon - Icon glyph wrapper part
 */
@customElement("lit-css-props")
export class LitCssPropsEl extends InputMixin(LitElement) {
  controllers = [];

  @prop({ attribute: "surface-color", reflect: true })
  surfaceColor = "teal";

  @state()
  internalValue = 0;

  @internalProperty()
  internalPropertyValue = "internal";

  @query("#button")
  button!: HTMLElement;

  static properties = {
    legacyFlag: { type: Boolean, attribute: "legacy-flag", reflect: true },
  };

  publicField = "visible";

  describeSurface(value: string): string {
    return value;
  }

  fireSurface() {
    this.dispatchEvent(new CustomEvent(SURFACE_CHANGED_EVENT, { detail: this.surfaceColor }));
  }

  addController() {}
  removeController() {}
  hostConnected() {}
  hostDisconnected() {}

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

export function InputMixin(superClass: typeof LitElement) {
  class InputMixinImplementation extends superClass {
    @prop({ attribute: "chained-value" })
    chainedValue = "chained";

    @prop({ type: Boolean })
    disabled = false;
  }

  return InputMixinImplementation;
}

@customElement("imported-lit-element")
export class ImportedLitElement extends externalMixin(LitElement) {}

export class RegisteredLitElement extends LitElement {}
customElements.define("registered-lit-element", RegisteredLitElement);

@customElement("getter-properties-element")
export class GetterPropertiesElement extends LitElement {
  static get properties() {
    return {
      getterFlag: { type: Boolean, reflect: true },
      getterInternal: { type: String, attribute: false },
    };
  }

  constructor() {
    super();
    this.getterFlag = false;
  }
}

export class CrossModuleLitElement extends LitElement {}

class CollapsedField extends MixinA(LitElement) {
  static properties = {
    firstName: { type: String },
  };

  constructor() {
    super();
    this.firstName = "John";
  }
}

class CollapsedElement extends MixinB(CollapsedField) {
  static properties = {
    lastName: { type: String },
  };

  constructor() {
    super();
    this.lastName = "Doe";
  }
}

function MixinB(superClass: typeof LitElement) {
  class MixinBImplementation extends superClass {
    static properties = { mixB: { type: Boolean } };
    constructor() {
      super();
      this.mixB = false;
    }
  }
  return MixinBImplementation;
}

function MixinA(superClass: typeof LitElement) {
  class MixinAImplementation extends superClass {
    static properties = { mixA: { type: Boolean } };
    constructor() {
      super();
      this.mixA = false;
    }
  }
  return MixinAImplementation;
}

customElements.define("collapsed-element", CollapsedElement);
