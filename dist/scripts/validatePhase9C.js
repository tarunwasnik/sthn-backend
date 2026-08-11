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
    for (const value of values) {
        expect(source.includes(value), `${label}: ${value}`);
    }
};
const required = [
    "src/enums/financial/withdrawalProviderExecutionOutcome.enum.ts",
    "src/errors/financial/WithdrawalProviderExecutionError.ts",
    "src/services/financial/withdrawalProviderExecution.service.ts",
    "src/tests/financial/phase9c/phase9c.runtime.test.ts",
    "src/tests/financial/phase9c/withdrawalProviderExecution.test.ts",
    "src/tests/financial/phase9c/withdrawalProviderReplay.test.ts",
    "src/tests/financial/phase9c/withdrawalProviderConcurrency.test.ts",
    "src/tests/financial/phase9c/withdrawalProviderFailure.test.ts",
    "src/tests/financial/phase9c/withdrawalProviderRegression.test.ts",
    "src/tests/financial/phase9c/fixtures/withdrawalProviderExecutionFixtures.ts",
];
for (const file of required) {
    expect(exists(file), `Missing Phase 9C file: ${file}`);
}
const status = read("src/enums/financial/internalWithdrawalProviderRequestStatus.enum.ts");
const error = read(required[1]);
const service = read(required[2]);
const providerModel = read("src/models/internalProvider/internalWithdrawalProviderRequest.model.ts");
const providerRepository = read("src/repositories/internalProvider/internalWithdrawalProviderRequest.repository.ts");
const withdrawalModel = read("src/models/creatorWithdrawalRequest.model.ts");
const withdrawalRepository = read("src/repositories/creatorWithdrawalRequest.repository.ts");
const simulator = read("src/services/providerSimulator/providerSimulator.service.ts");
const identity = read("src/utils/financial/withdrawalProviderIdentity.util.ts");
const eventTypes = read("src/constants/internalProvider/providerEventType.enum.ts");
const auditActions = read("src/enums/financial/auditAction.enum.ts");
const tests = required.filter((file) => file.includes("/phase9c/"))
    .map(read).join("\n");
const packageJson = read("package.json");
hasAll(status, [
    'INITIALIZED = "INITIALIZED"',
    'PROCESSING = "PROCESSING"',
    'SUCCEEDED = "SUCCEEDED"',
    'FAILED = "FAILED"',
], "Provider execution lifecycle incomplete");
expect(!status.includes("CANCELLED"), "Phase 9C introduced forbidden cancellation status.");
hasAll(providerModel, [
    "executionReference",
    "executionFingerprint",
    "providerMetadata",
    "execution",
    "payloads",
    "terminalResult",
    "processingAt",
    "succeededAt",
    "failedAt",
    "isTerminal",
], "Provider execution authority incomplete");
hasAll(providerRepository, [
    "markProcessing",
    "markTerminal",
    "InternalWithdrawalProviderRequestStatus.PROCESSING",
], "Provider lifecycle repository incomplete");
hasAll(withdrawalModel, [
    "providerTerminalStatus",
    "providerProcessingAt",
    "providerSucceededAt",
    "providerFailedAt",
    "providerExecutionMetadata",
], "Withdrawal provider synchronization incomplete");
hasAll(withdrawalRepository, [
    "synchronizeProviderTerminal",
    "CreatorWithdrawalRequestStatus.RESERVED",
    "providerTerminalStatus: { $exists: false }",
], "Withdrawal terminal guard incomplete");
hasAll(identity, [
    "deriveWithdrawalProviderExecutionIdentity",
    "executionReference",
    "executionFingerprint",
    "processingTransitionKey",
    "succeededTransitionKey",
    "failedTransitionKey",
], "Provider execution identity incomplete");
hasAll(simulator, [
    "simulateWithdrawalProvider",
    "WithdrawalProviderExecutionOutcome.SUCCESS",
    "InternalWithdrawalProviderRequestStatus.FAILED",
], "Internal Provider simulation reuse missing");
hasAll(eventTypes, [
    'WITHDRAWAL_PROVIDER_PROCESSING = "WITHDRAWAL_PROVIDER_PROCESSING"',
    'WITHDRAWAL_PROVIDER_SUCCEEDED = "WITHDRAWAL_PROVIDER_SUCCEEDED"',
    'WITHDRAWAL_PROVIDER_FAILED = "WITHDRAWAL_PROVIDER_FAILED"',
], "Provider execution events incomplete");
hasAll(auditActions, [
    "CREATOR_WITHDRAWAL_PROVIDER_PROCESSING",
    "CREATOR_WITHDRAWAL_PROVIDER_SUCCEEDED",
    "CREATOR_WITHDRAWAL_PROVIDER_FAILED",
], "Provider execution audits incomplete");
hasAll(service, [
    "withdrawalProviderInitializationService.validateReplay",
    "creatorWithdrawalRequestService.validateReplay",
    "providerSimulatorService.simulateWithdrawalProvider",
    "markProcessing",
    "markTerminal",
    "synchronizeProviderTerminal",
    "ProviderEventService.recordEvent",
    "validateReplay",
    "session.withTransaction",
    '"BEFORE_PROCESSING"',
    '"AFTER_PROCESSING"',
    '"BEFORE_TERMINAL_STATE"',
    '"AFTER_TERMINAL_STATE"',
    '"BEFORE_AUDIT"',
    '"BEFORE_COMMIT"',
], "Provider execution orchestration incomplete");
hasAll(error, [
    "WITHDRAWAL_PROVIDER_EXECUTION_PROVIDER_MISSING",
    "WITHDRAWAL_PROVIDER_EXECUTION_STATE_CONFLICT",
    "WITHDRAWAL_PROVIDER_EXECUTION_CONFLICT",
    "WITHDRAWAL_PROVIDER_EXECUTION_PROVIDER_FAILURE",
    "WITHDRAWAL_PROVIDER_EXECUTION_REPLAY_CONFLICT",
    "WITHDRAWAL_PROVIDER_EXECUTION_TRANSACTION_CONFLICT",
    "WITHDRAWAL_PROVIDER_EXECUTION_EVENT_CONFLICT",
    "WITHDRAWAL_PROVIDER_EXECUTION_TERMINAL_MISMATCH",
], "Provider execution error contract incomplete");
for (const forbidden of [
    "ledgerService",
    "walletProjectionService",
    "LedgerEntry.create",
    "Wallet.findOneAndUpdate",
    "reservation release",
    "reservation consumption",
    "refundService",
    "CANCELLED",
]) {
    expect(!service.includes(forbidden), `Phase 9C contains forbidden accounting/finalization: ${forbidden}`);
}
hasAll(tests, [
    "PROCESSING to SUCCEEDED without accounting",
    "FAILED provider execution without releasing reservation",
    "never duplicates provider execution, events, or audits",
    "ten concurrent execution attempts converge",
    "every injected execution interruption rolls back",
    "preserves Phase 9B and all unrelated financial authorities",
], "Phase 9C runtime proof incomplete");
expect(packageJson.includes('"validate:phase9c"') &&
    packageJson.includes('"test:phase9c"'), "Phase 9C package commands missing.");
expect(node_fs_1.default.existsSync(node_path_1.default.join(workspace, "docs/implementation/phase-9c-withdrawal-provider-execution.md")), "Phase 9C documentation missing.");
console.log("Phase 9C withdrawal provider execution static validation passed; MongoDB behavior requires test:phase9c.");
