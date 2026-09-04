/**
 * Standard tags fixture.
 * @tag standard-tags-element
 * @summary Compact summary for quick docs.
 * @deprecated Use BetterElement instead.
 * @attr {boolean} disabled - disables the element
 * @attribute {string} mode - mode description
 * @slot - default slot description
 * @slot container - named slot description
 * @cssprop --text-color - Controls text color
 * @cssproperty [--background-color=red] - Controls background color
 * @csspart bar - Styles the color of bar
 * @cssState open - reflects internal open state
 * @fires custom-event - emitted when work is done
 * @event {Event} typed-event - typed event example
 * @prop {string} externalTitle - property from JSDoc only
 */
export class StandardTagsElement extends HTMLElement {
  static get observedAttributes() {
    return ["disabled", "mode"];
  }

  /**
   * @summary Displayed user-facing name
   * @attribute
   * @default fallback-name
   */
  displayName;

  /**
   * @summary Runs action
   * @deprecated Use runV2 instead.
   */
  doWork(input, ...rest) {
    return input + String(rest.length);
  }

  /**
   * @attr temp-hidden
   * @internal
   */
  hiddenProp;
}

customElements.define("standard-tags-element", StandardTagsElement);
