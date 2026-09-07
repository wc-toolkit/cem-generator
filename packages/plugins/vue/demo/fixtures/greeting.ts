import { defineCustomElement } from "vue";

/** A small Vue greeting custom element. */
const Greeting = defineCustomElement({
  props: {
    /** The name displayed by the greeting. */
    name: { type: String, default: "World" },
    /** Number of times to repeat the greeting. */
    count: { type: Number, default: 1 },
  },
  emits: ["greet"],
});

customElements.define("demo-greeting", Greeting);

export { Greeting };
