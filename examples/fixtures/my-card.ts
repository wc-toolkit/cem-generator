import { LitElement, css, html } from "lit";

/**
 * A card-style container.
 * @tag my-card
 * @csspart title - Styles the title text region
 */
export class MyCard extends LitElement {
  static styles = css`
    /** Corner radius token contract for cards. */
    @property --my-card-radius {
      syntax: "<length>";
      initial-value: 12px;
      inherits: false;
    }

    :host {
      /** Host padding token. */
      --my-card-padding: 16px;
    }

    article {
      border-radius: var(--my-card-radius);
      padding: var(--my-card-padding);
    }
  `;

  render() {
    return html`
      <!-- Main outer surface -->
      <article part="container">
        <h2 part="title">My Card</h2>
      </article>
    `;
  }
}

customElements.define("my-card", MyCard);
