/**
 * Slot discovery fixture.
 * @tag slot-discovery-element
 * @slot header - JSDoc override description
 */
export class SlotDiscoveryElement extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <!-- Header slot -->
      <slot name="header"></slot>
      <!-- Main content area -->
      <slot></slot>
      <slot name="footer"></slot>
    `;
  }
}

customElements.define("slot-discovery-element", SlotDiscoveryElement);
