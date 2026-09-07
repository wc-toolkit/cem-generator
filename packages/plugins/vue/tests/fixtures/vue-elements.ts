import { defineCustomElement } from "vue";

/**
 * A Vue greeting custom element.
 * @event {Event} greet - A greeting was requested.
 */
const Greeting = defineCustomElement({
  props: {
    /** Name shown by the greeting. */
    name: String,
    count: { type: Number, default: 1 },
  },
  emits: ["greet"],
});

customElements.define("vue-greeting", Greeting);

export { Greeting };
