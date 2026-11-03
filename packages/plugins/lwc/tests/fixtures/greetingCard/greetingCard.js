import { LightningElement, api, track } from "lwc";

/**
 * A greeting card with a recipient and message.
 * @summary Displays a greeting.
 */
export default class GreetingCard extends LightningElement {
  /** Name of the recipient. */
  @api recipientName = "World";

  /** Whether the card is highlighted. */
  @api highlighted = false;

  _message = "Hello";

  @track draft = "";

  /** Current message text. */
  @api
  get message() {
    return this._message;
  }

  set message(value) {
    this._message = value;
  }

  /** Clears the draft text. */
  @api
  reset() {
    this.draft = "";
  }

  helper() {
    return this._message;
  }

  handleClick() {
    this.dispatchEvent(new CustomEvent("select", { detail: { id: this.recipientName } }));
  }
}
