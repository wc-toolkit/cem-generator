class PlainBase {}

/**
 * Not a Lit element: nothing in its bases is `LitElement`, even though it
 * matches the plugin's broadened `extends` prefilter and carries a tag.
 *
 * @tag unrelated-element
 */
export class UnrelatedElement extends PlainBase {}
