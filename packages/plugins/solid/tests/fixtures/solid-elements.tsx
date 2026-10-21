import { customElement } from "solid-element";

const SOLID_PAGE_SIZE = 10;
const SOLID_MODE = "compact" as const;
let solidMutableDefault = 4;

function makeSolidDefault() {
  return 2;
}

export interface GreetingProps {
  /** Name shown by the greeting. */
  name: string;
  count?: number;
}

/**
 * A Solid greeting custom element.
 * @event {CustomEvent} greet - A greeting was requested.
 */
export const Greeting = customElement(
  "solid-greeting",
  {
    name: "World",
    count: 1,
  },
  (props: GreetingProps, options) => {
    return (
      <>
        <style>{`:host { /** Greeting accent. */ --greeting-color: steelblue; }
        `}</style>
        {/* Greeting label */}
        <span part="label">
          {/* Label content */}
          <slot name="label" />
        </span>
        {/* Main content */}
        <slot />
        <button onClick={() => options.element.dispatchEvent(new CustomEvent("greet"))}>
          {props.name} {props.count}
        </button>
      </>
    );
  },
);

export const SolidDefaultValues = customElement(
  "solid-default-values",
  {
    pageSize: SOLID_PAGE_SIZE,
    mode: SOLID_MODE,
    enabled: false,
    nullable: null,
    values: [],
    options: {},
    createdAt: new Date(0),
    computed: makeSolidDefault(),
    mutable: solidMutableDefault,
    missing: undefined,
  },
  () => null as any,
);
