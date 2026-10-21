import { LitElement } from "lit";
import { property } from "lit/decorators.js";

const PAGE_SIZE = 10;
const PATIENT_TYPE = "new" as const;
let mutableDefault = 4;

function makeDefault() {
  return "computed";
}

export class LitPropertyDefaultsElement extends LitElement {
  /** Number of items. */
  @property({ type: Number })
  count = 2;

  @property({ attribute: "basic-label" })
  label = "Basic label";

  @property({ type: Boolean })
  enabled = false;

  @property({ type: Array })
  values = ["a"];

  @property()
  createdAt = new Date(0);

  /** @default "documented" */
  @property()
  documented = "initializer";

  @property()
  templateText = `template text`;

  @property()
  nullable = null;

  @property()
  patientType: "new" | "existing" = "new";

  @property()
  constantPatientType = PATIENT_TYPE;

  @property({ type: Number, attribute: "page-size" })
  pageSize = PAGE_SIZE;

  @property()
  mutable = mutableDefault;

  @property()
  missing = undefined;

  @property()
  objectValue = {};

  @property()
  called = makeDefault();
}

customElements.define("lit-property-defaults", LitPropertyDefaultsElement);
