import register from "preact-custom-element";

export interface GreetingProps {
  /** Name shown by the greeting. */
  name?: string;
  count?: number;
}

export function Greeting({ name, count }: GreetingProps) {
  return <p>{name} {count}</p>;
}

register(Greeting, "x-greeting", ["name"]);
