import { api } from "lwc";
import { BaseCard } from "../shared/baseCard.js";

export default class WarningCard extends BaseCard {
  /** Severity level of the warning. */
  @api severity = "warning";
}
