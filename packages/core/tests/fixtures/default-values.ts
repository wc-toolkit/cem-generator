const PAGE_SIZE = 10;
const MODE = "compact" as const;
let mutableDefault = 4;

function createDefault() {
  return 2;
}

export class DefaultValuesElement extends HTMLElement {
  count = 3;
  pageSize = PAGE_SIZE;
  mode = MODE;
  enabled = false;
  nullable = null;
  templateText = `ready`;
  values = [];
  options = {};
  createdAt = new Date(0);
  computed = createDefault();
  mutable = mutableDefault;
  missing = undefined;

  /** @default "documented" */
  documented = "initializer";
}

customElements.define("default-values", DefaultValuesElement);
