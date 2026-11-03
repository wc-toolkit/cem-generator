export const CARD_TAG = "my-card";

/** What the cards share. Never registered itself. */
export abstract class CardBase extends HTMLElement {
  static observedAttributes = ["src"];
}

/**
 * A card.
 *
 * @fires {CustomEvent<string>} card-open - The card opened.
 */
export class CardElement extends CardBase {}

/** A card no registration names: an element by its base class alone. */
export class UnregisteredCard extends CardBase {}

/** Not an element: nothing of its bases is HTMLElement. */
export class CardModel extends Map<string, string> {}

export const registerCard = () => {
  if (!customElements.get(CARD_TAG)) customElements.define(CARD_TAG, CardElement);
};
