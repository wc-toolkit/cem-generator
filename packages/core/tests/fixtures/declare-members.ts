type TypedEventTarget<TEventMap> = {
  addEventListener<K extends keyof TEventMap>(
    type: K,
    listener: (event: TEventMap[K]) => void,
  ): void;
};

type TypedEmit<TEventMap> = <K extends keyof TEventMap>(type: K, detail: TEventMap[K]) => boolean;

type XEventMap = {
  "value-change": { value: string };
};

export class DeclareMembersElement extends HTMLElement {
  declare public addEventListener: TypedEventTarget<XEventMap>["addEventListener"];
  declare protected emit: TypedEmit<XEventMap>;

  value = "ready";

  reset(): void {
    this.value = "ready";
  }
}

customElements.define("declare-members", DeclareMembersElement);
