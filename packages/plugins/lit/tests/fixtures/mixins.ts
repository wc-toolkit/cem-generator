import { LitElement } from "lit";
import { property as prop } from "lit/decorators.js";

export function externalMixin(superClass: typeof LitElement) {
  return class ExternalMixinImplementation extends superClass {
    @prop({ attribute: "external-value" })
    externalValue = "external";
  };
}
