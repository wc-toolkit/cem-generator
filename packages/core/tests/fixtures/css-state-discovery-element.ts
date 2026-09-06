/**
 * CSS custom state discovery fixture.
 * @tag css-state-discovery-element
 * @cssState busy - JSDoc override description
 */
export class CssStateDiscoveryElement extends HTMLElement {
  #state;

  static get observedAttributes() {
    return ["open"];
  }

  constructor() {
    super();
    this.#state = this.attachInternals();
    this.#state.states.add("initialized");
  }

  get state() {
    return this.attachInternals();
  }

  set loading(value: boolean) {
    if (value) {
      this.attachInternals().states.add("loading");
    } else {
      this.attachInternals().states.delete("loading");
    }
  }

  set busy(value: boolean) {
    if (value) {
      this.#state.states.add("busy");
    }
  }
}

customElements.define("css-state-discovery-element", CssStateDiscoveryElement);