/**
 * @tag program-unrelated-element
 */
export class ProgramUnrelatedElement extends HTMLElement {
  unrelatedMethod() {}
}

customElements.define("program-unrelated-element", ProgramUnrelatedElement);
