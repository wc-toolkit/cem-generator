/**
 * @tag base-element
 * @fires base-event
 * @fires keep-event
 */
export class BaseElement extends HTMLElement {
  /** @attribute base-count */
  baseCount = 1;

  /** @attribute keep-attr */
  keepAttr = "ok";

  emitBase() {}

  emitKeep() {}

  baseMethod() {}
  keepMethod() {}
}

/**
 * @tag child-element
 * @omit-method baseMethod
 * @omit-attribute base-count
 * @omit-event base-event
 */
export class ChildElement extends BaseElement {
  childMethod() {}
}

customElements.define("base-element", BaseElement);
customElements.define("child-element", ChildElement);
