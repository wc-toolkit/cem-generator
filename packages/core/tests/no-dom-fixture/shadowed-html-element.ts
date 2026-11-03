/** A class of the user's own that only shares the DOM's name. */
class HTMLElement {}

/** Not an element: its base is the local `HTMLElement`, with no DOM lib or with it. */
export class NotAnElement extends HTMLElement {}
