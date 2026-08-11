"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const backend = node_path_1.default.resolve(__dirname, "../..");
const workspace = node_path_1.default.resolve(backend, "..");
const read = (file) => node_fs_1.default.readFileSync(node_path_1.default.join(backend, file), "utf8");
const exists = (file) => node_fs_1.default.existsSync(node_path_1.default.join(backend, file));
const expect = (condition, message) => {
    if (!condition)
        throw new Error(message);
};
const hasAll = (source, values, label) => {
    for (const value of values)
        expect(source.includes(value), `${label}: ${value}`);
};
const required = [
    "src/enums/financial/bookingWalletReleaseCause.enum.ts",
    "src/errors/financial/BookingWalletReservationReleaseError.ts",
    "src/utils/financial/bookingWalletReleaseIdentity.util.ts",
    "src/services/financial/bookingWalletReservationRelease.service.ts",
    "src/tests/financial/phase8b/phase8b.runtime.test.ts",
    "src/tests/financial/phase8b/bookingWalletReleaseRejection.test.ts",
    "src/tests/financial/phase8b/bookingWalletReleaseExpiry.test.ts",
    "src/tests/financial/phase8b/bookingWalletReleaseCancellation.test.ts",
    "src/tests/financial/phase8b/bookingWalletReleaseReplay.test.ts",
    "src/tests/financial/phase8b/bookingWalletReleaseConcurrency.test.ts",
    "src/tests/financial/phase8b/bookingWalletReleaseFailure.test.ts",
    "src/tests/financial/phase8b/bookingWalletReleaseRegression.test.ts",
    "src/tests/financial/phase8b/fixtures/bookingWalletReleaseFixtures.ts",
];
for (const file of required)
    expect(exists(file), `Missing Phase 8B file: ${file}`);
const service = read("src/services/financial/bookingWalletReservationRelease.service.ts");
const termination = read("src/services/financial/bookingFinancialTermination.service.ts");
const identity = read("src/utils/financial/bookingWalletReleaseIdentity.util.ts");
const reservationModel = read("src/models/bookingFundReservation.model.ts");
const reservationRepository = read("src/repositories/bookingFundReservation.repository.ts");
const paymentRepository = read("src/repositories/payment.repository.ts");
const ledgerTypes = read("src/enums/financial/ledgerEntryType.enum.ts");
const ledgerSources = read("src/enums/financial/ledgerSource.enum.ts");
const projectionService = read("src/services/wallet/walletProjection.service.ts");
const creatorDecision = read("src/controllers/creatorBookingDecision.controller.ts");
const expiry = read("src/jobs/expireBookings.job.ts");
const userCancellation = read("src/controllers/userCancelBooking.controller.ts");
const creatorCancellation = read("src/controllers/creatorCancelBooking.controller.ts");
const errors = read("src/errors/financial/BookingWalletReservationReleaseError.ts");
const tests = required.filter((file) => file.includes("/phase8b/")).map(read).join("\n");
const packageJson = read("package.json");
hasAll(service, [
    "BookingFundReservationStatus.ACTIVE",
    "BookingFundReservationStatus.RELEASED",
    "BookingFundReservationStatus.CAPTURED",
    "PaymentStatus.AUTHORIZED",
    "PaymentStatus.CANCELLED",
    "PaymentStatus.EXPIRED",
    "ledgerService.createDebit",
    "ledgerService.createCredit",
    "walletProjectionService.applyProjectionMutation",
    "LedgerAccount.WALLET_RESERVED",
    "LedgerAccount.WALLET_AVAILABLE",
    "availableBalance: reservation.amount",
    "reservedBalance: -reservation.amount",
    "lockedBalance: 0",
    "minimums: { reservedBalance: reservation.amount }",
    "validateReleasedGraph",
    "findManyWithPostingKeys",
], "Release service invariant missing");
expect(!/Wallet\.(update|findOneAndUpdate|findByIdAndUpdate)/.test(service), "Release service directly mutates Wallet.");
expect(projectionService.includes("applyConditionalDelta"), "Wallet projection does not use a database-atomic conditional update.");
hasAll(identity, [
    'createHash("sha256")',
    "reservationKey",
    "authorizationTransactionId",
    "bookingStatus",
    "paymentId",
    "walletId",
    "amount",
    "currency",
    "cause",
    "releaseTransactionId",
    "projectionOperationKey",
], "Deterministic release identity missing");
expect(!/Date\.now|new Date|randomUUID|Math\.random/.test(identity), "Release identity contains mutable or random input.");
hasAll(ledgerTypes, ["BOOKING_FUNDS_RELEASED"], "Release Ledger type missing");
hasAll(ledgerSources, ["BOOKING_WALLET_RESERVATION_RELEASE"], "Release Ledger source missing");
hasAll(reservationRepository, [
    "findActiveByBooking",
    "findByBookingWithHiddenReleaseLinks",
    "findByReleaseKey",
    "findReleasedAuthoritative",
    "guardActiveToReleased",
    "status: BookingFundReservationStatus.ACTIVE",
], "Guarded reservation repository method missing");
hasAll(paymentRepository, [
    "guardWalletAuthorizationToReleasedTerminal",
    "status: PaymentStatus.AUTHORIZED",
    "method: PaymentMethod.WALLET",
], "Guarded Payment release transition missing");
for (const field of [
    "releaseReference",
    "releaseKey",
    "releaseTransactionId",
    "releaseLedgerEntryIds",
    "releaseProjectionOperationId",
    "releaseProjectionOperationReference",
    "releaseCause",
    "releaseReason",
    "releasedAt",
    "releasedByType",
    "releasedById",
    "releaseFingerprint",
])
    expect(reservationModel.includes(field), `Release metadata missing: ${field}`);
for (const field of [
    "releaseReference: 1",
    "releaseKey: 1",
    "releaseTransactionId: 1",
    "releaseProjectionOperationReference: 1",
    "partialFilterExpression",
    "status: 1, releasedAt: -1",
])
    expect(reservationModel.includes(field), `Release index missing: ${field}`);
hasAll(termination, [
    'type FinancialAction = "NONE" | "CANCEL" | "REFUND" | "RELEASE"',
    "bookingWalletReleaseCauseForTermination",
    "bookingWalletReservationReleaseService.release",
    "session.withTransaction",
    "slotRelease.modifiedCount",
    "validateReplay",
], "Transactional lifecycle integration missing");
hasAll(creatorDecision, [
    'decision === "REJECT"',
    "terminateBookingFinancially",
    'decision === "ACCEPT"',
    'booking.status = "CONFIRMED"',
], "Creator decision integration missing");
expect(expiry.includes("expireBookingsJob") && expiry.includes("BOOKING_EXPIRED"), "Expiry integration missing.");
expect(userCancellation.includes("terminateBookingFinancially"), "User cancellation integration missing.");
expect(creatorCancellation.includes("terminateBookingFinancially"), "Creator cancellation integration missing.");
for (const code of [
    "RESERVATION_NOT_FOUND",
    "INVALID_RESERVATION_STATUS",
    "INVALID_BOOKING_STATUS",
    "INVALID_PAYMENT_STATUS",
    "CAUSE_CONFLICT",
    "PAYMENT_METHOD_CONFLICT",
    "IDENTITY_CONFLICT",
    "AMOUNT_CONFLICT",
    "CURRENCY_CONFLICT",
    "LEDGER_CONFLICT",
    "PROJECTION_CONFLICT",
    "INSUFFICIENT_RESERVED_BALANCE",
    "TRANSACTION_CONFLICT",
    "COMPLETION_CONFLICT",
    "ALREADY_CAPTURED",
    "INTEGRITY_ERROR",
])
    expect(errors.includes(`BOOKING_WALLET_RELEASE_${code}`), `Typed error missing: ${code}`);
hasAll(tests, [
    "Creator rejection atomically",
    "expiry job releases once",
    "User cancellation releases",
    "Creator cancellation releases",
    "Admin cancellation releases",
    "service replay",
    "ten-way identical Creator rejection",
    "ten-way expiry",
    "ACCEPT versus REJECT",
    "ACCEPT versus EXPIRE",
    "REJECT versus EXPIRE",
    "cancellation versus Creator decision",
    "distinct same-Wallet releases",
    "reservation creation versus release",
    "insufficient reserved balance",
    "CAPTURED reservation",
    "projection failure after slot release",
    'name: "amount"',
    'name: "currency"',
    'name: "payment method"',
    "INTERNAL-provider rejection",
    "top-up funding records",
    "release authority indexes",
], "Runtime proof missing");
expect(tests.includes("BookingFundReservationStatus.ACTIVE") &&
    tests.includes("PaymentStatus.AUTHORIZED") &&
    tests.includes("Creator ACCEPT keeps"), "ACCEPT regression proof missing.");
for (const forbidden of [
    "PaymentLifecycleService",
    "InternalPaymentModel.create",
    "Settlement.create",
    "creatorWalletCredit",
    "captureReservation",
    "Refund.create",
])
    expect(!service.includes(forbidden), `Forbidden Phase 8B behavior found: ${forbidden}`);
expect(termination.includes("payment?.method === PaymentMethod.WALLET"), "Provider and Wallet booking branches are not explicit.");
expect(packageJson.includes('"validate:phase8b"') && packageJson.includes('"test:phase8b"'), "Phase 8B package commands missing.");
expect(node_fs_1.default.existsSync(node_path_1.default.join(workspace, "docs/implementation/phase-8b-booking-wallet-reservation-release.md")), "Phase 8B documentation missing.");
console.log("Phase 8B booking Wallet reservation release static validation passed; MongoDB behavior requires test:phase8b.");
