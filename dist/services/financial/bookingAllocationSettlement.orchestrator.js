"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bookingAllocationSettlementOrchestrator = exports.BookingAllocationSettlementOrchestrator = void 0;
const bookingEscrowAllocation_service_1 = require("./bookingEscrowAllocation.service");
const bookingCreatorSettlement_service_1 = require("./bookingCreatorSettlement.service");
/**
 * Explicit internal entry point. Allocation and settlement remain separate
 * committed stages, so a settlement failure never rolls back Phase 8D.
 */
class BookingAllocationSettlementOrchestrator {
    async allocateAndSettle(bookingId) {
        await bookingEscrowAllocation_service_1.bookingEscrowAllocationService.allocate(bookingId);
        return bookingCreatorSettlement_service_1.bookingCreatorSettlementService.settle(bookingId);
    }
}
exports.BookingAllocationSettlementOrchestrator = BookingAllocationSettlementOrchestrator;
exports.bookingAllocationSettlementOrchestrator = new BookingAllocationSettlementOrchestrator();
