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
    "src/enums/financial/creatorWithdrawalFinalizationOutcome.enum.ts",
    "src/errors/financial/CreatorWithdrawalFinalizationError.ts",
    "src/utils/financial/creatorWithdrawalFinalizationIdentity.util.ts",
    "src/services/financial/creatorWithdrawalFinalization.service.ts",
    "src/tests/financial/phase9d/phase9d.runtime.test.ts",
    "src/tests/financial/phase9d/withdrawalCompletion.test.ts",
    "src/tests/financial/phase9d/withdrawalFailureFinalization.test.ts",
    "src/tests/financial/phase9d/withdrawalReplay.test.ts",
    "src/tests/financial/phase9d/withdrawalConcurrency.test.ts",
    "src/tests/financial/phase9d/withdrawalRollback.test.ts",
    "src/tests/financial/phase9d/withdrawalIntegrity.test.ts",
    "src/tests/financial/phase9d/withdrawalRegression.test.ts",
    "src/tests/financial/phase9d/fixtures/creatorWithdrawalFinalizationFixtures.ts",
];
for (const file of required)
    expect(exists(file), `Missing Phase 9D file: ${file}`);
const status = read("src/enums/financial/creatorWithdrawalRequestStatus.enum.ts");
const account = read("src/enums/financial/ledgerAccount.enum.ts");
const entryType = read("src/enums/financial/ledgerEntryType.enum.ts");
const source = read("src/enums/financial/ledgerSource.enum.ts");
const model = read("src/models/creatorWithdrawalRequest.model.ts");
const repository = read("src/repositories/creatorWithdrawalRequest.repository.ts");
const identity = read(required[2]);
const service = read(required[3]);
const error = read(required[1]);
const tests = required.filter((file) => file.includes("/phase9d/")).map(read).join("\n");
const packageJson = read("package.json");
hasAll(status, ['COMPLETED = "COMPLETED"', 'FAILED = "FAILED"'], "Withdrawal terminal statuses incomplete");
expect(!status.includes("PROCESSING") && !status.includes("CANCELLED"), "Phase 9D introduced a forbidden withdrawal status.");
hasAll(account, ["WITHDRAWAL_RESERVED", "WALLET_AVAILABLE", "PAYOUT_CLEARING"], "Required Ledger accounts missing");
hasAll(entryType, ["CREATOR_WITHDRAWAL_COMPLETED", "CREATOR_WITHDRAWAL_FAILED_RELEASED"], "Finalization Ledger types missing");
hasAll(source, ["WITHDRAWAL_PROVIDER_FINALIZATION"], "Finalization source missing");
hasAll(model, ["finalizationOutcome", "finalizationReference", "finalizationKey",
    "finalizationTransactionId", "finalizationLedgerEntryIds",
    "finalizationProjectionOperationId", "finalizationFingerprint", "completedAt",
    "failedAt", "providerTerminalReference", "providerFailureCode",
    "status: 1, completedAt: -1", "status: 1, failedAt: -1",
    "walletId: 1, status: 1", "creatorId: 1, status: 1"], "Finalization model authority incomplete");
hasAll(repository, ["claimFinalizationIdentity", "finalizeClaimed",
    "CreatorWithdrawalRequestStatus.RESERVED", "reservedAmount: 0",
    "isActiveObligation: false"], "Guarded finalization transition incomplete");
hasAll(identity, ["finalizationFingerprint", "finalizationKey",
    "finalizationTransactionId", "reservedDebitPostingKey",
    "terminalCreditPostingKey", "projectionOperationKey", "projectionReference",
    "providerTerminalStatus", "reservationTransactionId", "outcome"], "Deterministic finalization identity incomplete");
hasAll(service, ["withdrawalProviderExecutionService.validateReplay",
    "InternalWithdrawalProviderRequestStatus.SUCCEEDED",
    "InternalWithdrawalProviderRequestStatus.FAILED", "ledgerService.createDebit",
    "ledgerService.createCredit", "LedgerAccount.WITHDRAWAL_RESERVED",
    "LedgerAccount.PAYOUT_CLEARING", "LedgerAccount.WALLET_AVAILABLE",
    "walletProjectionService.applyProjectionMutation", "reservedBalance: -withdrawal.amount",
    "availableBalance: outcome", "minimums: { reservedBalance: withdrawal.amount }",
    "session.withTransaction", "validateReplay", "assertNoOppositeGraph",
    "createFinancialAudit", "AFTER_FINALIZATION_IDENTITY", "BEFORE_COMMIT"], "Finalization orchestration incomplete");
for (const forbidden of ["Wallet.findOneAndUpdate", "providerSimulatorService",
    ".execute({", "reconcile", "repair", "scheduler", "worker", "refundService"]) {
    expect(!service.includes(forbidden), `Forbidden Phase 9D behavior: ${forbidden}`);
}
hasAll(error, ["WITHDRAWAL_NOT_FOUND", "PROVIDER_NOT_FOUND",
    "INVALID_WITHDRAWAL_STATUS", "INVALID_PROVIDER_STATUS", "PROVIDER_IDENTITY_CONFLICT",
    "DESTINATION_CONFLICT", "WALLET_NOT_FOUND", "WALLET_OWNERSHIP_CONFLICT",
    "AMOUNT_CONFLICT", "CURRENCY_CONFLICT", "INSUFFICIENT_RESERVED_BALANCE",
    "RESERVATION_LEDGER_CONFLICT", "RESERVATION_PROJECTION_CONFLICT",
    "LEDGER_CONFLICT", "PROJECTION_CONFLICT", "TRANSACTION_CONFLICT",
    "OUTCOME_CONFLICT", "REPLAY_CONFLICT", "INTEGRITY_ERROR"], "Finalization error contract incomplete");
hasAll(tests, ["successful provider reservation exactly once",
    "failed provider reservation exactly once", "replay is authoritative and read-only",
    "ten-way success and failure concurrency converge",
    "every injected interruption fully rolls back",
    "authority corruption fails closed",
    "does not execute providers or touch legacy financial domains"], "Phase 9D runtime proof incomplete");
expect(packageJson.includes('"validate:phase9d"') && packageJson.includes('"test:phase9d"'), "Phase 9D package commands missing.");
expect(node_fs_1.default.existsSync(node_path_1.default.join(workspace, "docs/implementation/phase-9d-withdrawal-finalization.md")), "Phase 9D documentation missing.");
console.log("Phase 9D withdrawal accounting finalization static validation passed; MongoDB behavior requires test:phase9d.");
