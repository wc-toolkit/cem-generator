/**
 * CSS property discovery fixture.
 */
export const fixtureStyles = `
  :host {
    /** Module-level background token. */
    --module-bg: coral;
  }
`;

/**
 * Module-level slot template.
 */
export const fixtureTemplate = `
  <!-- Module-level slot -->
  <slot name="module-slot"></slot>
  <!-- Module-level part -->
  <div part="card module-card"></div>
`;

/**
 * CSS property discovery element.
 * @tag css-prop-discovery-element
 * @cssprop --my-card-padding - JSDoc override description
 * @csspart footer - JSDoc override description
 */
export class CssPropDiscoveryElement extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <style>
        :host {
          /** Host text color token. */
          --my-card-bg: steelblue;
          /** Internal padding token. */
          --my-card-padding: 16px;
          --my-card-radius: 8px;
        }

        /** Foreground token contract. */
        @property --my-card-fg {
          syntax: "<color>";
          initial-value: white;
          inherits: true;
        }
      </style>
      <!-- Primary chrome -->
      <div part="button"></div>
      <!-- Main content -->
      <slot></slot>
    `;
  }
}

customElements.define("css-prop-discovery-element", CssPropDiscoveryElement);
