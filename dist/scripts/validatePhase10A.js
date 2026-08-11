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
const files = [
    "src/tests/financial/phase10a/phase10a.runtime.test.ts",
    "src/tests/financial/phase10a/marketplaceSuccessfulFlow.test.ts",
    "src/tests/financial/phase10a/marketplaceReplay.test.ts",
    "src/tests/financial/phase10a/marketplaceConcurrency.test.ts",
    "src/tests/financial/phase10a/marketplaceFinancialIntegrity.test.ts",
    "src/tests/financial/phase10a/marketplaceRegression.test.ts",
    "src/tests/financial/phase10a/fixtures/marketplaceFixtures.ts",
];
for (const file of files)
    expect(exists(file), `Missing Phase 10A file: ${file}`);
const runtime = read(files[0]);
const success = read(files[1]);
const replay = read(files[2]);
const concurrency = read(files[3]);
const integrity = read(files[4]);
const regression = read(files[5]);
const fixture = read(files[6]);
const tests = [runtime, success, replay, concurrency, integrity, regression,
    fixture].join("\n");
const packageJson = read("package.json");
const flowBody = fixture.slice(fixture.indexOf("export const createSuccessfulMarketplaceFlow"));
const orderedCalls = [
    "createFundedTopUp",
    "completeFundedTopUp",
    "postWalletBooking",
    "postCreatorDecision",
    "postCreatorCompletion",
    "bookingEscrowAllocationService.allocate",
    "bookingCreatorSettlementService.settle",
    "creatorWithdrawalRequestService.request",
    "withdrawalProviderInitializationService",
    "withdrawalProviderExecutionService.execute",
    "creatorWithdrawalFinalizationService",
    "creatorWithdrawalReconciliationService.inspect",
];
let position = -1;
for (const call of orderedCalls) {
    const next = flowBody.indexOf(call, position + 1);
    expect(next > position, `Full lifecycle ordering is missing: ${call}`);
    position = next;
}
hasAll(success, ["2_000", "1_050", "950", "800", "REQUESTED", "CONFIRMED",
    "COMPLETED", "AUTHORIZED", "CAPTURED", "ALLOCATED", "SETTLED",
    "INITIALIZED", "PROCESSING", "SUCCEEDED", "HEALTHY_COMPLETED"], "Successful lifecycle proof incomplete");
hasAll(replay, ["snapshotMarketplaceCounts", "replay", "true",
    "HEALTHY_COMPLETED"], "Deterministic replay proof incomplete");
hasAll(concurrency, ["length: 10", "Promise.all", "Set",
    "snapshotMarketplaceCounts"], "Concurrent replay proof incomplete");
hasAll(integrity, ["debits", "credits", "postingKeys", "ledgerEntryIds",
    "PLATFORM_ESCROW", "PLATFORM_COMMISSION_PAYABLE", "CREATOR_PAYABLE",
    "PLATFORM_SERVICE_FEE_REVENUE",
    "WITHDRAWAL_RESERVED", "PAYOUT_CLEARING", "auditActions"], "Financial integrity proof incomplete");
hasAll(regression, ["InternalPaymentModel", "Settlement.countDocuments",
    "Payout.countDocuments", "Withdrawal.countDocuments",
    "Refund.countDocuments", "CreatorWithdrawalRetryAttempt",
    "CreatorWithdrawalRepairOperation"], "Domain isolation proof incomplete");
hasAll(fixture, ["Wallet.create", "PayoutDestination.create",
    "WithdrawalProviderExecutionOutcome.SUCCESS"], "Runtime fixture incomplete");
for (const forbidden of [
    "Booking.create",
    "Payment.create",
    "BookingFundReservation.create",
    "BookingEscrowAllocation.create",
    "BookingCreatorSettlement.create",
    "CreatorWithdrawalRequest.create",
    "InternalWithdrawalProviderRequest.create",
    "LedgerEntry.create",
    "WalletProjectionOperation.create",
])
    expect(!fixture.includes(forbidden), `Terminal/financial record bypass: ${forbidden}`);
expect(!tests.includes("mock") && !tests.includes("setInterval") &&
    !tests.includes("worker_threads"), "Phase 10A contains a mock or worker.");
expect(packageJson.includes('"validate:phase10a"') &&
    packageJson.includes('"test:phase10a"'), "Phase 10A scripts are missing.");
expect(node_fs_1.default.existsSync(node_path_1.default.join(workspace, "docs/implementation/phase-10a-end-to-end-marketplace-verification.md")), "Phase 10A documentation is missing.");
console.log("Phase 10A end-to-end marketplace verification passed; MongoDB behavior requires test:phase10a.");
