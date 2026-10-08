import { ProgramBaseElement } from "./program-base-element";

/**
 * @tag program-entry-element
 */
export class ProgramEntryElement extends ProgramBaseElement {
  entryMethod() {}
}

customElements.define("program-entry-element", ProgramEntryElement);
