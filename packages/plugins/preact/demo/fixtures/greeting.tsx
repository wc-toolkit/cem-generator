import register from "preact-custom-element";

export interface GreetingProps {
  /** The name displayed by the greeting. */
  name?: string;
  /** Number of times to repeat the greeting. */
  count?: number;
}

/** A small Preact greeting custom element. */
export function Greeting({ name = "World", count = 1 }: GreetingProps) {
  return <p>{Array.from({ length: count }, () => `Hello, ${name}!`).join(" ")}</p>;
}

register(Greeting, "demo-greeting", ["name", "count"]);
