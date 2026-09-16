import { customElement } from "solid-element";

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
