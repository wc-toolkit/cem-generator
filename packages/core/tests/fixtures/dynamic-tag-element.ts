const prefix: string = "my";

/** Tags no checker can know: a template of a string, a computed value, and a `let`. */
export const TEMPLATE_TAG = `${prefix}-template`;
export const COMPUTED_TAG = ["my", "computed"].join("-");
export let LET_TAG = "my-let";

export class TemplateTagElement extends HTMLElement {}
export class ComputedTagElement extends HTMLElement {}
export class LetTagElement extends HTMLElement {}

customElements.define(TEMPLATE_TAG, TemplateTagElement);
customElements.define(COMPUTED_TAG, ComputedTagElement);
customElements.define(LET_TAG, LetTagElement);
