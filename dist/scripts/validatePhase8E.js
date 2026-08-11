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
    "src/enums/financial/bookingCreatorSettlementStatus.enum.ts",
    "src/errors/financial/BookingCreatorSettlementError.ts",
    "src/utils/financial/bookingCreatorSettlementIdentity.util.ts",
    "src/models/bookingCreatorSettlement.model.ts",
    "src/repositories/bookingCreatorSettlement.repository.ts",
    "src/services/financial/bookingCreatorSettlement.service.ts",
    "src/services/financial/bookingAllocationSettlement.orchestrator.ts",
    "src/tests/financial/phase8e/phase8e.runtime.test.ts",
    "src/tests/financial/phase8e/bookingCreatorSettlementFullFlow.test.ts",
    "src/tests/financial/phase8e/bookingCreatorSettlementReplay.test.ts",
    "src/tests/financial/phase8e/bookingCreatorSettlementConcurrency.test.ts",
    "src/tests/financial/phase8e/bookingCreatorSettlementWalletRace.test.ts",
    "src/tests/financial/phase8e/bookingCreatorSettlementFailure.test.ts",
    "src/tests/financial/phase8e/bookingCreatorSettlementRegression.test.ts",
    "src/tests/financial/phase8e/fixtures/bookingCreatorSettlementFixtures.ts",
];
for (const file of required)
    expect(exists(file), `Missing Phase 8E file: ${file}`);
const service = read("src/services/financial/bookingCreatorSettlement.service.ts");
const orchestrator = read("src/services/financial/bookingAllocationSettlement.orchestrator.ts");
const identity = read("src/utils/financial/bookingCreatorSettlementIdentity.util.ts");
const model = read("src/models/bookingCreatorSettlement.model.ts");
const repository = read("src/repositories/bookingCreatorSettlement.repository.ts");
const accounts = read("src/enums/financial/ledgerAccount.enum.ts");
const entryTypes = read("src/enums/financial/ledgerEntryType.enum.ts");
const sources = read("src/enums/financial/ledgerSource.enum.ts");
const auditActions = read("src/enums/financial/auditAction.enum.ts");
const errors = read("src/errors/financial/BookingCreatorSettlementError.ts");
const tests = required.filter((file) => file.includes("/phase8e/"))
    .map(read).join("\n");
const packageJson = read("package.json");
hasAll(service, [
    'booking.status !== "COMPLETED"',
    "PaymentStatus.CAPTURED",
    "BookingFundReservationStatus.CAPTURED",
    "BookingEscrowAllocationStatus.ALLOCATED",
    "bookingWalletReservationCaptureService.validateReplay",
    "deriveBookingEscrowAllocationIdentity",
    "CreatorProfile.findOne",
    "userId: core.booking.creatorId",
    "walletRepository.findByUserAndCurrency",
    "creatorWallet.userId.toString() !== creator.userId.toString()",
    "creatorWallet.currency !== booking.currency",
    "LedgerAccount.CREATOR_PAYABLE",
    "LedgerAccount.WALLET_AVAILABLE",
    "ledgerService.createDebit",
    "ledgerService.createCredit",
    "walletProjectionService.applyProjectionMutation",
    "availableBalance: graph.allocation.creatorAmount",
    "reservedBalance: 0",
    "lockedBalance: 0",
    "guardPendingToSettled",
    "validateSettledGraph",
    "session.withTransaction",
    'status: "OPEN"',
    "booking.isFinancialLocked",
    "createFinancialAudit",
    "isTransientTransactionError",
], "Creator settlement invariant missing");
expect(!/Wallet\.(update|findOneAndUpdate|findByIdAndUpdate|create)/.test(service), "Settlement directly mutates a Wallet.");
expect(!service.includes("walletCreationService"), "Settlement automatically creates a Creator Wallet.");
expect(!service.includes("LedgerAccount.PLATFORM_ESCROW,"), "Settlement posts to PLATFORM_ESCROW.");
expect(!service.includes("LedgerAccount.PLATFORM_COMMISSION_PAYABLE,"), "Settlement posts to PLATFORM_COMMISSION_PAYABLE.");
hasAll(identity, [
    'createHash("sha256")',
    "allocationId",
    "bookingId",
    "paymentId",
    "reservationId",
    "customerUserId",
    "creatorId",
    "creatorUserId",
    "creatorWalletId",
    "bookingAmount",
    "currency",
    "commissionAmount",
    "creatorAmount",
    "captureTransactionId",
    "allocationTransactionId",
    "settlementKey",
    "settlementTransactionId",
    "creatorPayableDebitPostingKey",
    "walletAvailableCreditPostingKey",
    "projectionOperationKey",
    "settlementFingerprint",
], "Deterministic settlement identity missing");
expect(!/Date\.now|new Date|randomUUID|Math\.random/.test(identity), "Settlement identity contains mutable or random input.");
for (const field of [
    "settlementReference",
    "settlementKey",
    "bookingId",
    "paymentId",
    "reservationId",
    "allocationId",
    "customerUserId",
    "creatorId",
    "creatorUserId",
    "creatorWalletId",
    "bookingAmount",
    "currency",
    "commissionAmount",
    "creatorAmount",
    "captureTransactionId",
    "allocationTransactionId",
    "settlementTransactionId",
    "settlementFingerprint",
    "settlementProjectionOperationReference",
    "settlementLedgerEntryIds",
    "status",
    "settledAt",
    "version",
])
    expect(model.includes(field), `Settlement model field missing: ${field}`);
for (const index of [
    "settlementReference: 1",
    "settlementKey: 1",
    "allocationId: 1",
    "bookingId: 1",
    "paymentId: 1",
    "reservationId: 1",
    "settlementTransactionId: 1",
    "settlementProjectionOperationReference: 1",
    "status: 1, settledAt: -1",
    "creatorId: 1, settledAt: -1",
    "creatorUserId: 1, settledAt: -1",
    "creatorWalletId: 1, settledAt: -1",
])
    expect(model.includes(index), `Settlement index missing: ${index}`);
hasAll(repository, [
    "createPending",
    "findBySettlementKey",
    "findByAllocation",
    "findByBooking",
    "findSettledAuthoritative",
    "guardPendingToSettled",
    "status: BookingCreatorSettlementStatus.PENDING",
    "status: BookingCreatorSettlementStatus.SETTLED",
    "settledAt: { $exists: false }",
], "Settlement repository authority missing");
hasAll(orchestrator, [
    "bookingEscrowAllocationService.allocate",
    "bookingCreatorSettlementService.settle",
], "Separate-stage internal orchestrator missing");
hasAll(accounts, ["CREATOR_PAYABLE", "WALLET_AVAILABLE"], "Settlement Ledger accounts missing");
hasAll(entryTypes, ["BOOKING_CREATOR_SETTLED"], "Settlement Ledger type missing");
hasAll(sources, ["BOOKING_CREATOR_WALLET_SETTLEMENT"], "Settlement Ledger source missing");
hasAll(auditActions, ["BOOKING_CREATOR_WALLET_SETTLED"], "Settlement audit action missing");
for (const code of [
    "BOOKING_NOT_FOUND",
    "PAYMENT_NOT_FOUND",
    "RESERVATION_NOT_FOUND",
    "ALLOCATION_NOT_FOUND",
    "CREATOR_NOT_FOUND",
    "WALLET_NOT_FOUND",
    "INVALID_BOOKING_STATUS",
    "INVALID_PAYMENT_STATUS",
    "INVALID_RESERVATION_STATUS",
    "INVALID_ALLOCATION_STATUS",
    "IDENTITY_CONFLICT",
    "AMOUNT_CONFLICT",
    "COMMISSION_CONFLICT",
    "CURRENCY_CONFLICT",
    "WALLET_OWNERSHIP_CONFLICT",
    "FINANCIAL_LOCKED",
    "DISPUTE_OPEN",
    "LEDGER_CONFLICT",
    "PROJECTION_CONFLICT",
    "TRANSACTION_CONFLICT",
    "COMPLETION_CONFLICT",
    "INTEGRITY_ERROR",
])
    expect(errors.includes(`BOOKING_CREATOR_SETTLEMENT_${code}`), `Settlement error code missing: ${code}`);
hasAll(tests, [
    "full flow settles Creator payable 800",
    "service, orchestrator, model reload",
    "ten identical concurrent settlements",
    "distinct concurrent settlements",
    "outgoing reservation projection",
    "actual top-up accounting",
    "missing Creator Wallet",
    "Wallet currency mismatch",
    "OPEN dispute blocks",
    "financial lock blocks",
    "projection failure rolls back",
    "failure after projection rolls back",
    "audit failure before commit",
    "corrupted allocation amounts",
    "corrupted allocation Ledger direction",
    "corrupted projection deltas",
    "provider, top-up, payout, withdrawal",
    "authority indexes",
], "Phase 8E MongoDB runtime proof missing");
for (const forbidden of [
    "InternalPaymentModel",
    "paymentLifecycleService",
    "InternalTopUpFunding",
    "payoutService",
    "withdrawalService",
    "payoutDestinationService",
    "internalProvider",
    "refundService",
])
    expect(!service.includes(forbidden), `Forbidden Phase 8E service dependency found: ${forbidden}`);
expect(packageJson.includes('"validate:phase8e"') &&
    packageJson.includes('"test:phase8e"'), "Phase 8E package commands missing.");
expect(node_fs_1.default.existsSync(node_path_1.default.join(workspace, "docs/implementation/phase-8e-creator-payable-wallet-settlement.md")), "Phase 8E documentation missing.");
console.log("Phase 8E Creator payable Wallet settlement static validation passed; MongoDB behavior requires test:phase8e.");
