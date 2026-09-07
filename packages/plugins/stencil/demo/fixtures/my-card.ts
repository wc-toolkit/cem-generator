declare function Component(options: { tag: string }): ClassDecorator;
declare function Prop(options?: { attribute?: string; reflect?: boolean }): PropertyDecorator;
declare function Event(options?: { eventName?: string }): PropertyDecorator;

type EventEmitter<T> = { emit(value: T): void };

/** A Stencil card component. */
@Component({ tag: "demo-card" })
export class MyCard {
  /** The card heading. */
  @Prop() heading!: string;

  /** Whether the card is highlighted. */
  @Prop({ reflect: true }) highlighted = false;

  /** Notifies consumers when the card is selected. */
  @Event({ eventName: "card-selected" }) selected!: EventEmitter<{ id: string }>;

  /** Selects the card. */
  select() {}

  componentDidLoad() {}
  render() {}
}
