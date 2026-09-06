declare const ExternalBase: {
  new (): HTMLElement;
};

/**
 * @tag external-child-element
 */
export class ExternalChildElement extends ExternalBase {
  ownMethod() {}
}

customElements.define("external-child-element", ExternalChildElement);
