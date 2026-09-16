import register from "preact-custom-element";

export interface GreetingProps {
  /** Name shown by the greeting. */
  name?: string;
  count?: number;
}

export function Greeting({ name, count }: GreetingProps) {
  document.dispatchEvent(new CustomEvent("greet"));
  return (
    <>
      <style>{`:host { /** Greeting accent. */ --greeting-color: steelblue; }`}</style>
      {/* Greeting label */}
      <span part="label">
        {/* Label content */}
        <slot name="label" />
      </span>
      {/* Main content */}
      <slot />
      <p>
        {name} {count}
      </p>
    </>
  );
}

register(Greeting, "x-greeting", ["name"]);
