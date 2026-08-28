"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const adminFinancial_dto_1 = require("../../dtos/adminFinancial.dto");
const adminFinancial_service_1 = require("../../services/admin/adminFinancial.service");
const detail = () => (0, adminFinancial_dto_1.paymentFinancialDetailDto)({
    payment: {
        paymentReference: "PAY-ADMIN-DETAIL", bookingId: "booking-id", userId: "user-id", creatorId: "creator-id",
        status: "CAPTURED", amount: 105000, currency: "USD", serviceAmount: 100000, customerFeeAmount: 5000,
        provider: "INTERNAL", providerPaymentId: "provider-safe", escrowRecognizedAt: new Date("2026-01-01T00:00:00.000Z"),
        createdAt: new Date("2026-01-01T00:00:00.000Z"), updatedAt: new Date("2026-01-02T00:00:00.000Z"),
        providerPayload: { secret: "never expose" }, attributes: { internal: true }, reservationId: "hidden",
    },
    booking: { bookingReference: "BKG-DETAIL", status: "COMPLETED", paymentMethod: "WALLET", completedAt: new Date("2026-01-03T00:00:00.000Z"), settlementEligibleAt: new Date("2026-01-04T00:00:00.000Z") },
    reservation: {
        reservationReference: "RSV-DETAIL", status: "CAPTURED", amount: 105000, currency: "USD", authorizedAt: new Date("2026-01-01T00:00:00.000Z"),
        capturedAt: new Date("2026-01-03T00:00:00.000Z"), captureReference: "CAP-SAFE", captureCause: "BOOKING_COMPLETION",
        walletId: "hidden", ledgerTransactionId: "hidden", captureTransactionId: "hidden", requestFingerprint: "hidden",
    },
    escrow: { allocationReference: "EALLOC-SAFE", status: "ALLOCATED", allocatedAt: new Date("2026-01-03T00:00:00.000Z"), allocationKey: "hidden", escrowLedgerTransaction: "hidden" },
    settlement: { settlementReference: "SET-SAFE", status: "SETTLED", settledAt: new Date("2026-01-05T00:00:00.000Z"), settlementKey: "hidden", settlementTransactionId: "hidden" },
});
(0, node_test_1.default)("Admin payment financial detail includes the safe Payment reference and status", () => {
    const result = detail();
    strict_1.default.equal(result.payment.paymentReference, "PAY-ADMIN-DETAIL");
    strict_1.default.equal(result.payment.status, "CAPTURED");
});
(0, node_test_1.default)("Admin payment financial detail preserves persisted payment amounts", () => {
    const result = detail();
    strict_1.default.equal(result.payment.amount, 105000);
    strict_1.default.equal(result.payment.serviceAmount, 100000);
    strict_1.default.equal(result.payment.customerFeeAmount, 5000);
});
(0, node_test_1.default)("Admin payment financial detail provides only the safe provider reference", () => {
    const result = detail();
    strict_1.default.equal(result.payment.providerReference, "provider-safe");
    strict_1.default.equal(JSON.stringify(result).includes("providerPayload"), false);
});
(0, node_test_1.default)("Admin payment financial detail includes the safe booking relationship", () => {
    const result = detail();
    strict_1.default.deepEqual(result.booking?.bookingReference, "BKG-DETAIL");
    strict_1.default.equal(result.booking?.paymentMethod, "WALLET");
});
(0, node_test_1.default)("Admin payment financial detail exposes reservation lifecycle status and amount", () => {
    const result = detail();
    strict_1.default.equal(result.reservation?.status, "CAPTURED");
    strict_1.default.equal(result.reservation?.amount, 105000);
    strict_1.default.equal(result.reservation?.currency, "USD");
});
(0, node_test_1.default)("Admin payment financial detail exposes reservation capture timestamps without internals", () => {
    const result = detail();
    strict_1.default.equal(result.reservation.captureReference, "CAP-SAFE");
    strict_1.default.equal(JSON.stringify(result).includes("captureTransactionId"), false);
    strict_1.default.equal(JSON.stringify(result).includes("walletId"), false);
});
(0, node_test_1.default)("Admin payment financial detail exposes reservation release fields only when persisted", () => {
    const result = (0, adminFinancial_dto_1.paymentFinancialDetailDto)({ payment: detail().payment, reservation: { reservationReference: "RSV-RELEASE", status: "RELEASED", amount: 105000, currency: "USD", releasedAt: new Date("2026-01-03T00:00:00.000Z"), releaseReference: "REL-SAFE", releaseCause: "BOOKING_CANCELLED" } });
    strict_1.default.equal(result.reservation.releaseReference, "REL-SAFE");
    strict_1.default.equal(result.reservation.captureReference, undefined);
});
(0, node_test_1.default)("Admin payment financial detail includes a bounded escrow relationship", () => {
    const result = detail();
    strict_1.default.equal(result.escrow?.allocationReference, "EALLOC-SAFE");
    strict_1.default.equal(JSON.stringify(result).includes("escrowLedgerTransaction"), false);
});
(0, node_test_1.default)("Admin payment financial detail includes a bounded settlement relationship", () => {
    const result = detail();
    strict_1.default.equal(result.settlement?.settlementReference, "SET-SAFE");
    strict_1.default.equal(JSON.stringify(result).includes("settlementTransactionId"), false);
});
(0, node_test_1.default)("Admin payment financial detail remains safe when no Wallet financial relationships exist", () => {
    const result = (0, adminFinancial_dto_1.paymentFinancialDetailDto)({ payment: detail().payment });
    strict_1.default.equal(result.reservation, undefined);
    strict_1.default.equal(result.escrow, undefined);
    strict_1.default.equal(result.settlement, undefined);
});
(0, node_test_1.default)("Admin payment financial detail represents an active reservation without inferring Payment state", () => {
    const result = (0, adminFinancial_dto_1.paymentFinancialDetailDto)({ payment: detail().payment, reservation: { reservationReference: "RSV-ACTIVE", status: "ACTIVE", amount: 105000, currency: "USD", authorizedAt: new Date("2026-01-01T00:00:00.000Z") } });
    strict_1.default.equal(result.payment.status, "CAPTURED");
    strict_1.default.equal(result.reservation.status, "ACTIVE");
});
(0, node_test_1.default)("Admin payment financial detail returns a bounded not-found error for an absent Payment", async () => {
    const service = new adminFinancial_service_1.AdminFinancialService();
    service.read = {
        paymentFinancialDetail: async () => null,
    };
    await strict_1.default.rejects(service.getPaymentFinancialDetail("PAY-MISSING"), /Payment not found/);
});
