/** Provider-operation state. This is deliberately separate from PaymentStatus:
 * it records what is known about an external call, not financial settlement. */
export enum PaymentOperationStatus {
  PENDING = "PENDING",
  UNKNOWN = "UNKNOWN",
  CONFIRMED = "CONFIRMED",
  FAILED = "FAILED",
}
