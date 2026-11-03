type Constructor<T = object> = new (...args: any[]) => T;

/** What the cards share. Never registered itself. */
export abstract class CardBase extends HTMLElement {}

/** A mixin of a theme. */
export const WithTheme = <T extends Constructor<HTMLElement>>(Base: T) =>
  class extends Base {
    theme = "light";
  };

/** An element by a mixin of its base class. */
export class ThemedCard extends WithTheme(CardBase) {}

/** Not an element: a mixin of no HTMLElement. */
export const WithName = <T extends Constructor>(Base: T) =>
  class extends Base {
    name = "";
  };

export class NamedModel extends WithName(Object) {}
