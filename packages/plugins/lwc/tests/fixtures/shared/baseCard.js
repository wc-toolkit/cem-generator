import { LightningElement, api } from "lwc";

/** Shared behavior for card components. */
export class BaseCard extends LightningElement {
  /** Accessible title for the card. */
  @api title = "";
}
