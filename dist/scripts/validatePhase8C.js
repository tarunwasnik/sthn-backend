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
    "src/enums/financial/bookingWalletCaptureCause.enum.ts",
    "src/errors/financial/BookingWalletReservationCaptureError.ts",
    "src/utils/financial/bookingWalletCaptureIdentity.util.ts",
    "src/services/financial/bookingWalletReservationCapture.service.ts",
    "src/tests/financial/phase8c/phase8c.runtime.test.ts",
    "src/tests/financial/phase8c/bookingWalletCaptureFullFlow.test.ts",
    "src/tests/financial/phase8c/bookingWalletCaptureReplay.test.ts",
    "src/tests/financial/phase8c/bookingWalletCaptureConcurrency.test.ts",
    "src/tests/financial/phase8c/bookingWalletCaptureLifecycleRace.test.ts",
    "src/tests/financial/phase8c/bookingWalletCaptureFailure.test.ts",
    "src/tests/financial/phase8c/bookingWalletCaptureRegression.test.ts",
    "src/tests/financial/phase8c/fixtures/bookingWalletCaptureFixtures.ts",
];
for (const file of required)
    expect(exists(file), `Missing Phase 8C file: ${file}`);
const service = read("src/services/financial/bookingWalletReservationCapture.service.ts");
const completion = read("src/services/booking/completeBooking.service.ts");
const completionJob = read("src/jobs/completeBookings.job.ts");
const identity = read("src/utils/financial/bookingWalletCaptureIdentity.util.ts");
const reservationModel = read("src/models/bookingFundReservation.model.ts");
const paymentModel = read("src/models/payment.model.ts");
const bookingModel = read("src/models/booking.model.ts");
const reservationRepository = read("src/repositories/bookingFundReservation.repository.ts");
const paymentRepository = read("src/repositories/payment.repository.ts");
const bookingRepository = read("src/repositories/booking.repository.ts");
const projectionService = read("src/services/wallet/walletProjection.service.ts");
const ledgerTypes = read("src/enums/financial/ledgerEntryType.enum.ts");
const ledgerSources = read("src/enums/financial/ledgerSource.enum.ts");
const errors = read("src/errors/financial/BookingWalletReservationCaptureError.ts");
const controller = read("src/controllers/completeBooking.controller.ts");
const tests = required.filter((file) => file.includes("/phase8c/")).map(read).join("\n");
const packageJson = read("package.json");
hasAll(service, [
    "BookingFundReservationStatus.ACTIVE",
    "BookingFundReservationStatus.CAPTURED",
    "BookingFundReservationStatus.RELEASED",
    "PaymentStatus.AUTHORIZED",
    "PaymentStatus.CAPTURED",
    "LedgerAccount.WALLET_RESERVED",
    "LedgerAccount.PLATFORM_ESCROW",
    "ledgerService.createDebit",
    "ledgerService.createCredit",
    "walletProjectionService.applyProjectionMutation",
    "availableBalance: 0",
    "reservedBalance: -reservation.amount",
    "lockedBalance: 0",
    "minimums: { reservedBalance: reservation.amount }",
    "validateCapturedGraph",
    "findManyWithPostingKeys",
    "createFinancialAudit",
    "session: input.session",
], "Capture service invariant missing");
expect(!/Wallet\.(update|findOneAndUpdate|findByIdAndUpdate)/.test(service), "Capture service directly mutates Wallet.");
expect(projectionService.includes("applyConditionalDelta"), "Wallet projection does not use an atomic conditional update.");
hasAll(identity, [
    'createHash("sha256")',
    "reservationKey",
    "authorizationTransactionId",
    "bookingId",
    "paymentId",
    "userId",
    "walletId",
    "creatorId",
    "serviceId",
    "amount",
    "currency",
    "cause",
    "captureTransactionId",
    "reservedPostingKey",
    "clearingPostingKey",
    "projectionOperationKey",
    "captureFingerprint",
], "Deterministic capture identity missing");
expect(!/Date\.now|new Date|randomUUID|Math\.random/.test(identity), "Capture identity contains mutable or random input.");
hasAll(ledgerTypes, ["BOOKING_FUNDS_CAPTURED"], "Capture Ledger type missing");
hasAll(ledgerSources, ["BOOKING_WALLET_CAPTURE"], "Capture Ledger source missing");
hasAll(reservationRepository, [
    "findActiveByBookingWithCaptureFields",
    "findByCaptureKey",
    "findCapturedAuthoritative",
    "guardActiveToCaptured",
    "status: BookingFundReservationStatus.ACTIVE",
], "Guarded reservation capture repository method missing");
hasAll(paymentRepository, [
    "guardWalletAuthorizedToCaptured",
    "findWalletCapturedAuthoritative",
    "status: PaymentStatus.AUTHORIZED",
    "method: PaymentMethod.WALLET",
], "Guarded Wallet Payment capture transition missing");
hasAll(bookingRepository, [
    "guardConfirmedToCompleted",
    "findCompletedReplay",
    'status: "CONFIRMED"',
    'status: "COMPLETED"',
], "Guarded Booking completion transition missing");
for (const field of [
    "captureReference",
    "captureKey",
    "captureTransactionId",
    "captureLedgerEntryIds",
    "captureProjectionOperationId",
    "captureProjectionOperationReference",
    "captureCause",
    "capturedAt",
    "capturedByType",
    "capturedById",
    "captureFingerprint",
])
    expect(reservationModel.includes(field), `Capture metadata missing: ${field}`);
for (const field of [
    "captureReference: 1",
    "captureKey: 1",
    "captureTransactionId: 1",
    "captureProjectionOperationReference: 1",
    "partialFilterExpression",
    "status: 1, capturedAt: -1",
])
    expect(reservationModel.includes(field), `Capture index missing: ${field}`);
hasAll(paymentModel, [
    "captureReference",
    "capturedAmount",
    "captureCause",
    "capturedAt",
], "Payment capture metadata missing");
hasAll(bookingModel, [
    "completionCause",
    "completedByType",
    "completedById",
    "completionOperationKey",
], "Booking completion identity missing");
hasAll(completion, [
    "FeatureFlagGuard.requireEnabled",
    'role !== "creator"',
    "booking.creatorId.toString()",
    'booking.status !== "CONFIRMED"',
    "booking.isFinancialLocked",
    'status: "OPEN"',
    "booking.isPayable",
    "PaymentMethod.WALLET",
    "PaymentMethod.INTERNAL",
    "PaymentStatus.CAPTURED",
    "guardConfirmedToCompleted",
    "bookingWalletReservationCaptureService.capture",
    "session.withTransaction",
    "validateReplay",
    "completeBookingAutomatically",
], "Completion/capture orchestration missing");
hasAll(completionJob, [
    'status: "CONFIRMED"',
    "isFinancialLocked",
    'status: "OPEN"',
    "completeBookingAutomatically",
], "Automatic completion integration missing");
for (const code of [
    "BOOKING_NOT_FOUND",
    "PAYMENT_NOT_FOUND",
    "RESERVATION_NOT_FOUND",
    "INVALID_BOOKING_STATUS",
    "INVALID_PAYMENT_STATUS",
    "INVALID_RESERVATION_STATUS",
    "PAYMENT_METHOD_CONFLICT",
    "IDENTITY_CONFLICT",
    "AMOUNT_CONFLICT",
    "CURRENCY_CONFLICT",
    "CAUSE_CONFLICT",
    "FINANCIAL_LOCKED",
    "DISPUTE_OPEN",
    "INSUFFICIENT_RESERVED_BALANCE",
    "LEDGER_CONFLICT",
    "PROJECTION_CONFLICT",
    "TRANSACTION_CONFLICT",
    "ALREADY_RELEASED",
    "COMPLETION_CONFLICT",
    "INTEGRITY_ERROR",
])
    expect(errors.includes(`BOOKING_WALLET_CAPTURE_${code}`), `Typed error missing: ${code}`);
expect(controller.includes("BookingWalletReservationCaptureError") &&
    controller.includes("err.statusCode") &&
    controller.includes("err.code"), "Capture controller error mapping missing.");
hasAll(tests, [
    "full flow: Creator completion",
    "automatic completion captures",
    "repeated Creator completion",
    "ten-way Creator completion",
    "distinct same-Wallet captures",
    "reservation creation versus capture",
    'for (const contender of ["User", "Creator", "Admin"]',
    "one coherent terminal winner",
    "direct release service",
    "Creator completion versus automatic completion",
    "expiry discovery cannot release",
    "financial lock blocks",
    "OPEN dispute blocks",
    "insufficient reserved balance",
    "projection interruption",
    "Ledger interruption",
    "audit interruption",
    "RELEASED reservation cannot be captured",
    'name: "amount"',
    'name: "currency"',
    'name: "payment method"',
    'name: "customer Wallet identity"',
    'name: "customer User identity"',
    'name: "Creator identity"',
    'name: "service identity"',
    'name: "authorization transaction"',
    'name: "partial capture transaction"',
    'name: "Payment terminal status"',
    'name: "Booking completion timestamp"',
    'name: "Payment capture timestamp"',
    'name: "projection deltas"',
    'name: "clearing account"',
    "INTERNAL-provider completion",
    "top-up funding records",
    "cancellation still releases",
    "capture authority and completion indexes",
], "MongoDB runtime proof missing");
for (const forbidden of [
    "PaymentLifecycleService",
    "InternalPaymentModel.create",
    "Settlement.create",
    "Refund.create",
    "Payout.create",
    "Withdrawal.create",
    "creatorWalletCredit",
    "CreatorBalance",
])
    expect(!service.includes(forbidden), `Forbidden Phase 8C behavior found: ${forbidden}`);
expect(!service.includes("WALLET_CAPTURED"), "An unauthorized customer Wallet captured bucket was introduced.");
expect(completion.includes("payment.method === PaymentMethod.WALLET") &&
    completion.includes("payment.method === PaymentMethod.INTERNAL"), "Provider and Wallet booking branches are not explicit.");
expect(packageJson.includes('"validate:phase8c"') && packageJson.includes('"test:phase8c"'), "Phase 8C package commands missing.");
expect(node_fs_1.default.existsSync(node_path_1.default.join(workspace, "docs/implementation/phase-8c-booking-wallet-reservation-capture.md")), "Phase 8C documentation missing.");
console.log("Phase 8C Booking Wallet reservation capture static validation passed; MongoDB behavior requires test:phase8c.");
