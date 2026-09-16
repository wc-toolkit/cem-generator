type Mode = "primary" | "secondary" | undefined;
type Payload = { id: string; count: number };
import type { SharedMode, SharedPayload } from "./parsed-types-shared";

class LocalizeController {
  lang() {
    return "en";
  }
}

/**
 * @tag parsed-types-element
 * @attribute {Mode} mode - mode attribute
 * @event {Payload} payload-change - payload updated
 */
export class ParsedTypesElement extends HTMLElement {
  host: HTMLElement;
  controller: LocalizeController;
  observer: MutationObserver | null;
  optionalHost: undefined | HTMLElement;
  position: "top" | "top-start" | "top-end" | "bottom" | "bottom-start" | "bottom-end";

  /** @attribute */
  mode?: Mode;

  /** @attribute {SharedMode} shared-mode - imported mode attribute */
  sharedMode?: SharedMode;

  setPayload(payload: Payload): Payload {
    return payload;
  }

  setShared(payload: SharedPayload): SharedPayload {
    return payload;
  }

  async waitForUpdate(): Promise<void> {
    return;
  }

  focus(options?: FocusOptions): void {
    void options;
  }
}

customElements.define("parsed-types-element", ParsedTypesElement);
