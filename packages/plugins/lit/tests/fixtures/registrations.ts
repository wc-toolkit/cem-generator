import { CrossModuleLitElement, DynamicRegisteredLitElement } from "./lit-css-properties.js";

customElements.define("cross-module-lit", CrossModuleLitElement);

const dynamicTag: string = "dynamic-lit-element";
customElements.define(dynamicTag, DynamicRegisteredLitElement);
