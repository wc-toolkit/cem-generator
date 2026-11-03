/** A base element of a type parameter. Never registered itself. */
export abstract class ValueBase<T> extends HTMLElement {
  value?: T;
}

/** An element by a base class it gives a type argument to. */
export class TextValue extends ValueBase<string> {}

/** An element by a generic base two classes up. */
export class ShortText extends TextValue {}

/** Not an element: a generic base of no HTMLElement. */
export class StringList extends Array<string> {}
