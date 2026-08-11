"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const root = node_path_1.default.resolve(__dirname, "../..");
const workspace = node_path_1.default.resolve(root, "..");
const read = (file) => node_fs_1.default.readFileSync(node_path_1.default.join(root, file), "utf8");
const exists = (file) => node_fs_1.default.existsSync(node_path_1.default.join(root, file));
const expect = (condition, message) => {
    if (!condition)
        throw new Error(message);
};
const requiredFiles = [
    "src/models/bookingFundReservation.model.ts",
    "src/enums/financial/bookingFundReservationStatus.enum.ts",
    "src/errors/financial/BookingWalletReservationError.ts",
    "src/utils/financial/bookingWalletReservationIdentity.util.ts",
    "src/repositories/bookingFundReservation.repository.ts",
    "src/services/financial/bookingWalletReservation.service.ts",
    "src/tests/financial/phase8a/phase8a.runtime.test.ts",
    "src/tests/financial/phase8a/bookingWalletReservationFullFlow.test.ts",
    "src/tests/financial/phase8a/bookingWalletReservationReplay.test.ts",
    "src/tests/financial/phase8a/bookingWalletReservationConcurrency.test.ts",
    "src/tests/financial/phase8a/bookingWalletReservationFailure.test.ts",
    "src/tests/financial/phase8a/bookingPaymentMethodRegression.test.ts",
];
for (const file of requiredFiles)
    expect(exists(file), `Missing Phase 8A file ${file}.`);
const model = read("src/models/bookingFundReservation.model.ts");
const statuses = read("src/enums/financial/bookingFundReservationStatus.enum.ts");
const identity = read("src/utils/financial/bookingWalletReservationIdentity.util.ts");
const service = read("src/services/financial/bookingWalletReservation.service.ts");
const repository = read("src/repositories/bookingFundReservation.repository.ts");
const controller = read("src/controllers/booking.controller.ts");
const paymentMethod = read("src/enums/financial/paymentMethod.enum.ts");
const errors = read("src/errors/financial/BookingWalletReservationError.ts");
const ledgerService = read("src/services/financial/ledger.service.ts");
const projectionService = read("src/services/wallet/walletProjection.service.ts");
const tests = requiredFiles
    .filter((file) => file.includes("/phase8a/") && file.endsWith(".ts"))
    .map(read).join("\n");
for (const status of ["PENDING", "ACTIVE", "RELEASED", "CAPTURED", "FAILED"]) {
    expect(statuses.includes(`${status} = "${status}"`), `Missing reservation status ${status}.`);
}
for (const field of [
    "reservationReference", "reservationKey", "bookingId", "paymentId",
    "userId", "walletId", "creatorId", "serviceId", "amount", "currency",
    "ledgerTransactionId", "ledgerEntryIds", "projectionOperationId",
    "requestFingerprint", "version",
])
    expect(model.includes(field), `Reservation model missing ${field}.`);
for (const authority of [
    "{ bookingId: 1 }, { unique: true }",
    "{ paymentId: 1 }, { unique: true }",
    "ledgerTransactionId: 1",
    "userId: 1, status: 1",
    "walletId: 1, status: 1",
])
    expect(model.includes(authority), `Reservation index authority missing ${authority}.`);
expect(paymentMethod.includes('WALLET = "WALLET"'), "Wallet payment method is missing.");
expect(identity.includes('createHash("sha256")') &&
    identity.includes("ledgerTransactionId") &&
    identity.includes("projectionOperationKey") &&
    !identity.includes("Date.now") &&
    !identity.includes("new Date"), "Reservation identity is not stable and deterministic.");
expect(service.includes("authenticatedUserId") &&
    service.includes("walletRepository.findByUserAndCurrency") &&
    service.includes("payment.amount !== booking.totalAmount") &&
    service.includes("booking.currency !== currency"), "Authenticated ownership, server amount, or currency authority is incomplete.");
expect(service.includes("minimums: { availableBalance: booking.totalAmount }") &&
    service.includes("availableBalance: -booking.totalAmount") &&
    service.includes("reservedBalance: booking.totalAmount") &&
    service.includes("lockedBalance: 0"), "Atomic available-to-reserved projection is incomplete.");
expect(service.includes("ledgerService.createDebit") &&
    service.includes("ledgerService.createCredit") &&
    service.includes("walletProjectionService.applyProjectionMutation"), "Existing LedgerService and WalletProjectionService are not reused.");
expect(ledgerService.includes("walletId?: string"), "Ledger Wallet linkage is missing.");
expect(projectionService.includes("applyConditionalDelta"), "Database-atomic projection guard is missing.");
expect(repository.includes("markActiveFromPending") &&
    repository.includes("status: BookingFundReservationStatus.PENDING") &&
    !repository.includes("updateMany"), "Reservation lifecycle repository is not narrowly guarded.");
expect(controller.includes("bookingWalletReservationService.authorize") &&
    controller.includes("paymentLifecycleService.completePaymentLifecycle") &&
    controller.includes("paymentMethod === PaymentMethod.WALLET") &&
    !controller.includes("ledgerService.") &&
    !controller.includes("walletProjectionService."), "Controller integration or Internal Provider regression boundary is incomplete.");
expect(controller.includes("safeWalletBookingResponse") &&
    !controller.match(/safeWalletBookingResponse[\s\S]{0,1500}ledgerEntryIds/), "Wallet booking response is not safely bounded.");
for (const code of [
    "WALLET_NOT_FOUND", "WALLET_OWNERSHIP_CONFLICT", "CURRENCY_CONFLICT",
    "INVALID_AMOUNT", "INSUFFICIENT_AVAILABLE_BALANCE", "IDENTITY_CONFLICT",
    "TRANSACTION_CONFLICT", "LEDGER_CONFLICT", "PROJECTION_CONFLICT",
    "PAYMENT_CONFLICT", "BOOKING_CONFLICT", "INVALID_STATUS", "INTEGRITY_ERROR",
])
    expect(errors.includes(`BOOKING_WALLET_RESERVATION_${code}`), `Missing typed error ${code}.`);
for (const proof of [
    "BookingFundReservationStatus.ACTIVE", "PaymentMethod.WALLET",
    "MoneyDirection.DEBIT", "MoneyDirection.CREDIT",
    "deltas.availableBalance", "deltas.reservedBalance", "deltas.lockedBalance",
    "same-Wallet overspend", "projection-stage failure",
    "Internal Provider booking still creates InternalPayment",
])
    expect(tests.includes(proof), `Runtime proof missing ${proof}.`);
for (const forbidden of [
    "new Mutex", "globalLock", "setInterval(", "while (true)",
])
    expect(!service.includes(forbidden) && !controller.includes(forbidden), `Forbidden process-local concurrency authority found: ${forbidden}.`);
for (const deferredImplementation of [
    "markReleasedFromActive", "markCapturedFromActive", "releaseReservation(",
    "captureReservation(", "creatorWalletCredit",
])
    expect(!service.includes(deferredImplementation), `Deferred Phase 8 behavior was implemented: ${deferredImplementation}.`);
const packageJson = read("package.json");
expect(packageJson.includes('"validate:phase8a"') && packageJson.includes('"test:phase8a"'), "Phase 8A package scripts are missing.");
expect(node_fs_1.default.existsSync(node_path_1.default.join(workspace, "docs/implementation/phase-8a-booking-wallet-reservation.md")), "Phase 8A documentation is missing.");
console.log("Phase 8A booking Wallet reservation static validation passed; runtime behavior requires test:phase8a.");
