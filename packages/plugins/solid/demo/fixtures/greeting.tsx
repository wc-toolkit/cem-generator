import { customElement } from "solid-element";

interface GreetingProps {
  /** The name displayed by the greeting. */
  name: string;
  /** Number of times to repeat the greeting. */
  count?: number;
}

/** A small Solid greeting custom element. */
export const Greeting = customElement(
  "demo-greeting",
  {
    name: "World",
    count: 1,
  },
  (props: GreetingProps) => <p>Hello, {props.name}! ({props.count})</p>,
);
