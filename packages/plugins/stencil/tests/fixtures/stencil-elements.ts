declare function Component(options: { tag: string }): ClassDecorator;
declare function Prop(options?: { attribute?: string; reflects?: boolean }): PropertyDecorator;
declare function Event(options?: { eventName?: string }): PropertyDecorator;

@Component({ tag: "todo-list" })
export class TodoList {
  @Prop() color!: string;
  @Prop() isValid!: boolean;
  @Prop() controller!: MyController;
  @Prop({ attribute: "valid" }) valid!: boolean;
  @Prop({ reflects: true }) message = "Hello";

  @Event() todoCompleted!: EventEmitter<Todo>;
  @Event({ eventName: "foo" }) fooEvent!: EventEmitter<Todo>;

  someMethod() {
    const template = `<!-- Panel --><div part="panel"><!-- Header --><slot name="header"></slot><!-- Default --><slot></slot></div>`;
    const styles = `:host { /** Panel color. */ --panel-color: gray; }`;
    document.dispatchEvent(new CustomEvent("panel-change"));
  }
  componentWillLoad() {}
  componentDidLoad() {}
  componentShouldUpdate() {}
}

type MyController = { connected: boolean };
type Todo = { id: string };
type EventEmitter<T> = { emit(value: T): void };
