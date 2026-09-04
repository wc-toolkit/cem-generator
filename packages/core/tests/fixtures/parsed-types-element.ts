type Mode = "primary" | "secondary" | undefined;
type Payload = { id: string; count: number };
import type { SharedMode, SharedPayload } from "./parsed-types-shared";

/**
 * @tag parsed-types-element
 * @attribute {Mode} mode - mode attribute
 * @event {Payload} payload-change - payload updated
 */
export class ParsedTypesElement extends HTMLElement {
  /** @attribute */
  mode?: Mode;

  /** @attribute {SharedMode} shared-mode - imported mode attribute */
  sharedMode?: SharedMode;

  setPayload(payload: Payload, mode?: Mode): Payload {
    return payload;
  }

  setShared(payload: SharedPayload, mode?: SharedMode): SharedPayload {
    return payload;
  }
}

customElements.define("parsed-types-element", ParsedTypesElement);
