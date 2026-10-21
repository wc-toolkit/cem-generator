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

const STENCIL_PAGE_SIZE = 10;
const STENCIL_MODE = "compact" as const;
let stencilMutableDefault = 4;

function makeStencilDefault() {
  return 2;
}

@Component({ tag: "stencil-default-values" })
export class StencilDefaultValues {
  @Prop({ attribute: "page-size" }) pageSize = STENCIL_PAGE_SIZE;
  @Prop() mode = STENCIL_MODE;
  @Prop() enabled = false;
  @Prop() nullable = null;
  @Prop() values = [];
  @Prop() options = {};
  @Prop() createdAt = new Date(0);
  @Prop() computed = makeStencilDefault();
  @Prop() mutable = stencilMutableDefault;
  @Prop() missing = undefined;
}
