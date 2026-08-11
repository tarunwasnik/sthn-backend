export const SETTLEMENT_HOLD_MS = 72 * 60 * 60 * 1000;

/** One UTC timestamp policy shared by manual and scheduled completion. */
export function createBookingCompletionTiming(completedAt = new Date()): {
  completedAt: Date;
  settlementEligibleAt: Date;
} {
  return {
    completedAt,
    settlementEligibleAt: new Date(completedAt.getTime() + SETTLEMENT_HOLD_MS),
  };
}
