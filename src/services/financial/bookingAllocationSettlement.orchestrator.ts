import { bookingEscrowAllocationService } from "./bookingEscrowAllocation.service";
import {
  bookingCreatorSettlementService,
  SafeBookingCreatorSettlementResult,
} from "./bookingCreatorSettlement.service";

/**
 * Explicit internal entry point. Allocation and settlement remain separate
 * committed stages, so a settlement failure never rolls back Phase 8D.
 */
export class BookingAllocationSettlementOrchestrator {
  async allocateAndSettle(
    bookingId: string,
  ): Promise<SafeBookingCreatorSettlementResult> {
    await bookingEscrowAllocationService.allocate(bookingId);
    return bookingCreatorSettlementService.settle(bookingId);
  }
}

export const bookingAllocationSettlementOrchestrator =
  new BookingAllocationSettlementOrchestrator();
