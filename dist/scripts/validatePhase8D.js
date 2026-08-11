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
    "src/enums/financial/bookingEscrowAllocationStatus.enum.ts",
    "src/errors/financial/BookingEscrowAllocationError.ts",
    "src/utils/financial/bookingEscrowAllocationIdentity.util.ts",
    "src/models/bookingEscrowAllocation.model.ts",
    "src/repositories/bookingEscrowAllocation.repository.ts",
    "src/services/financial/bookingEscrowAllocation.service.ts",
    "src/tests/financial/phase8d/phase8d.runtime.test.ts",
    "src/tests/financial/phase8d/bookingEscrowAllocationFullFlow.test.ts",
    "src/tests/financial/phase8d/bookingEscrowAllocationReplay.test.ts",
    "src/tests/financial/phase8d/bookingEscrowAllocationConcurrency.test.ts",
    "src/tests/financial/phase8d/bookingEscrowAllocationFailure.test.ts",
    "src/tests/financial/phase8d/bookingEscrowAllocationRegression.test.ts",
    "src/tests/financial/phase8d/fixtures/bookingEscrowAllocationFixtures.ts",
];
for (const file of required)
    expect(exists(file), `Missing Phase 8D file: ${file}`);
const service = read("src/services/financial/bookingEscrowAllocation.service.ts");
const identity = read("src/utils/financial/bookingEscrowAllocationIdentity.util.ts");
const model = read("src/models/bookingEscrowAllocation.model.ts");
const repository = read("src/repositories/bookingEscrowAllocation.repository.ts");
const accounts = read("src/enums/financial/ledgerAccount.enum.ts");
const entryTypes = read("src/enums/financial/ledgerEntryType.enum.ts");
const sources = read("src/enums/financial/ledgerSource.enum.ts");
const auditActions = read("src/enums/financial/auditAction.enum.ts");
const errors = read("src/errors/financial/BookingEscrowAllocationError.ts");
const calculation = read("src/services/financial/settlementCalculation.service.ts");
const tests = required.filter((file) => file.includes("/phase8d/")).map(read).join("\n");
const packageJson = read("package.json");
hasAll(service, [
    "CREATOR_COMMISSION_RATE_BPS",
    "marketplacePricingService",
    "BookingEscrowAllocationStatus.PENDING",
    "BookingEscrowAllocationStatus.ALLOCATED",
    'booking.status !== "COMPLETED"',
    "PaymentStatus.CAPTURED",
    "BookingFundReservationStatus.CAPTURED",
    "booking.isFinancialLocked",
    'status: "OPEN"',
    "Settlement.exists",
    "bookingWalletReservationCaptureService.validateReplay",
    "ledgerService.createDebit",
    "ledgerService.createCredit",
    "LedgerAccount.PLATFORM_ESCROW",
    "LedgerAccount.PLATFORM_COMMISSION_PAYABLE",
    "LedgerAccount.CREATOR_PAYABLE",
    "LedgerAccount.PLATFORM_SERVICE_FEE_REVENUE",
    "MoneyDirection.DEBIT",
    "MoneyDirection.CREDIT",
    "guardPendingToAllocated",
    "createFinancialAudit",
    "session.withTransaction",
    "validateAllocatedGraph",
    "allocation.allocationLedgerEntryIds.length !== 4",
    "debitTotal !== creditTotal",
], "Allocation service invariant missing");
expect(!service.includes("walletProjectionService"), "Allocation invokes WalletProjectionService.");
expect(!/Wallet\.(update|findOneAndUpdate|findByIdAndUpdate|create)/.test(service), "Allocation directly mutates a Wallet.");
expect(!service.includes("walletId:"), "Allocation creates a Wallet-linked posting.");
hasAll(calculation, [
    "PLATFORM_COMMISSION_RATE_BPS = CREATOR_COMMISSION_RATE_BPS",
], "Frozen marketplace commission configuration missing");
hasAll(identity, [
    'createHash("sha256")',
    "bookingId",
    "paymentId",
    "reservationId",
    "customerId",
    "creatorId",
    "bookingAmount",
    "currency",
    "commissionRateBps",
    "commissionAmount",
    "creatorAmount",
    "captureTransactionId",
    "allocationKey",
    "allocationLedgerTransaction",
    "escrowDebitPostingKey",
    "commissionCreditPostingKey",
    "creatorCreditPostingKey",
    "platformFeeCreditPostingKey",
    "allocationFingerprint",
], "Deterministic allocation identity missing");
expect(!/Date\.now|new Date|randomUUID|Math\.random/.test(identity), "Allocation identity contains mutable or random input.");
for (const field of [
    "allocationReference",
    "allocationKey",
    "bookingId",
    "paymentId",
    "reservationId",
    "customerId",
    "creatorId",
    "bookingAmount",
    "currency",
    "commissionRateBps",
    "commissionAmount",
    "creatorAmount",
    "escrowLedgerTransaction",
    "allocationLedgerTransaction",
    "allocationLedgerEntryIds",
    "allocationFingerprint",
    "status",
    "allocatedAt",
    "version",
])
    expect(model.includes(field), `Allocation model field missing: ${field}`);
for (const index of [
    "allocationReference: 1",
    "allocationKey: 1",
    "bookingId: 1",
    "paymentId: 1",
    "reservationId: 1",
    "escrowLedgerTransaction: 1",
    "allocationLedgerTransaction: 1",
    "creatorId: 1, status: 1",
    "status: 1, allocatedAt: -1",
])
    expect(model.includes(index), `Allocation index missing: ${index}`);
hasAll(repository, [
    "createPending",
    "findByBookingAuthoritative",
    "findByAllocationKey",
    "guardPendingToAllocated",
    "status: BookingEscrowAllocationStatus.PENDING",
    "status: BookingEscrowAllocationStatus.ALLOCATED",
], "Allocation repository authority missing");
hasAll(accounts, [
    "PLATFORM_COMMISSION_PAYABLE",
    "CREATOR_PAYABLE",
    "PLATFORM_SERVICE_FEE_REVENUE",
], "Allocation Ledger accounts missing");
hasAll(entryTypes, ["BOOKING_ESCROW_ALLOCATED"], "Allocation Ledger type missing");
hasAll(sources, ["BOOKING_ESCROW_ALLOCATION"], "Allocation Ledger source missing");
hasAll(auditActions, ["BOOKING_ESCROW_ALLOCATED"], "Allocation audit action missing");
for (const code of [
    "BOOKING_NOT_FOUND",
    "PAYMENT_NOT_FOUND",
    "RESERVATION_NOT_FOUND",
    "ALREADY_ALLOCATED",
    "STATUS_CONFLICT",
    "IDENTITY_CONFLICT",
    "LEDGER_CONFLICT",
    "TRANSACTION_CONFLICT",
    "DISPUTE_OPEN",
    "FINANCIAL_LOCKED",
    "INTEGRITY_ERROR",
])
    expect(errors.includes(`BOOKING_ESCROW_ALLOCATION_${code}`), `Allocation error code missing: ${code}`);
hasAll(tests, [
    "full flow allocates captured escrow into fee revenue",
    "model-reload replay",
    "ten identical concurrent allocations",
    "OPEN dispute blocks",
    "financial lock blocks",
    "existing settlement link blocks",
    "Ledger failure after escrow debit",
    "failure after all Ledger postings",
    "audit failure before commit",
    "corrupted capture Ledger",
    "corrupted allocation amounts",
    "corrupted allocation Ledger direction",
    "Phase 8C capture remains complete",
    "INTERNAL-provider booking remains outside",
    "top-up records cannot be allocated",
    "allocation authority indexes",
], "Phase 8D MongoDB runtime proof missing");
for (const forbidden of [
    "InternalPaymentModel",
    "PaymentLifecycle",
    "InternalTopUpFunding",
    "Settlement.create",
    "Payout.create",
    "Withdrawal.create",
    "Refund.create",
    "CREATOR_AVAILABLE",
    "PLATFORM_CREATOR_COMMISSION_REVENUE",
])
    expect(!service.includes(forbidden), `Forbidden Phase 8D behavior found: ${forbidden}`);
expect(packageJson.includes('"validate:phase8d"') &&
    packageJson.includes('"test:phase8d"'), "Phase 8D package commands missing.");
expect(node_fs_1.default.existsSync(node_path_1.default.join(workspace, "docs/implementation/phase-8d-captured-escrow-allocation.md")), "Phase 8D documentation missing.");
console.log("Phase 8D captured escrow allocation static validation passed; MongoDB behavior requires test:phase8d.");
