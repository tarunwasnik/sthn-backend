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
    "src/enums/financial/internalWithdrawalProviderRequestStatus.enum.ts",
    "src/errors/financial/WithdrawalProviderInitializationError.ts",
    "src/utils/financial/withdrawalProviderIdentity.util.ts",
    "src/models/internalProvider/internalWithdrawalProviderRequest.model.ts",
    "src/repositories/internalProvider/internalWithdrawalProviderRequest.repository.ts",
    "src/services/financial/withdrawalProviderInitialization.service.ts",
    "src/tests/financial/phase9b/phase9b.runtime.test.ts",
    "src/tests/financial/phase9b/withdrawalProviderInitialization.test.ts",
    "src/tests/financial/phase9b/withdrawalProviderReplay.test.ts",
    "src/tests/financial/phase9b/withdrawalProviderConcurrency.test.ts",
    "src/tests/financial/phase9b/withdrawalProviderFailure.test.ts",
    "src/tests/financial/phase9b/withdrawalProviderRegression.test.ts",
    "src/tests/financial/phase9b/fixtures/withdrawalProviderInitializationFixtures.ts",
];
for (const file of required) {
    expect(exists(file), `Missing Phase 9B file: ${file}`);
}
const status = read(required[0]);
const error = read(required[1]);
const identity = read(required[2]);
const model = read(required[3]);
const repository = read(required[4]);
const service = read(required[5]);
const withdrawalModel = read("src/models/creatorWithdrawalRequest.model.ts");
const events = read("src/constants/internalProvider/providerEventType.enum.ts");
const actions = read("src/enums/financial/auditAction.enum.ts");
const tests = required.filter((file) => file.includes("/phase9b/"))
    .map(read).join("\n");
const packageJson = read("package.json");
hasAll(status, ['CREATED = "CREATED"', 'INITIALIZED = "INITIALIZED"'], "Phase 9B provider statuses missing");
for (const forbidden of [
    "markProcessing",
    "markTerminal",
    "WITHDRAWAL_PROVIDER_PROCESSING",
    "WITHDRAWAL_PROVIDER_SUCCEEDED",
    "WITHDRAWAL_PROVIDER_FAILED",
]) {
    expect(!service.includes(forbidden), `Phase 9B implements later provider execution: ${forbidden}`);
}
hasAll(model, [
    "providerRequestReference",
    "providerRequestKey",
    "withdrawalReference",
    "creatorReference",
    "walletReference",
    "destinationReference",
    "currency",
    "amount",
    "providerStatus",
    "providerReference",
    "providerFingerprint",
    "version",
], "Provider authority incomplete");
hasAll(model, [
    "schema.index({ providerRequestReference: 1 }, { unique: true })",
    "schema.index({ providerRequestKey: 1 }, { unique: true })",
    "schema.index({ withdrawalReference: 1 }, { unique: true })",
    "{ providerReference: 1 }",
], "Provider authority indexes incomplete");
hasAll(identity, [
    "withdrawalReference",
    "creatorId",
    "creatorReference",
    "walletId",
    "destinationReference",
    "currency",
    "amount",
    "provider",
    "providerFingerprint",
], "Deterministic provider identity incomplete");
hasAll(repository, [
    "findByWithdrawal",
    "findByKey",
    "InternalWithdrawalProviderRequestStatus.CREATED",
    "InternalWithdrawalProviderRequestStatus.INITIALIZED",
], "Provider repository incomplete");
hasAll(service, [
    "creatorWithdrawalRequestService.validateReplay",
    "CreatorWithdrawalRequestStatus.RESERVED",
    "PayoutDestinationVerificationStatus.VERIFIED",
    "ProviderEventService.recordEvent",
    "WITHDRAWAL_PROVIDER_CREATED",
    "WITHDRAWAL_PROVIDER_INITIALIZED",
    "CREATOR_WITHDRAWAL_PROVIDER_INITIALIZED",
    "linkProviderInitialization",
    "session.withTransaction",
    "validateReplay",
], "Provider initialization service incomplete");
hasAll(withdrawalModel, [
    "providerRequestReference",
], "Withdrawal provider integration missing");
hasAll(events, [
    'WITHDRAWAL_PROVIDER_CREATED = "WITHDRAWAL_PROVIDER_CREATED"',
    'WITHDRAWAL_PROVIDER_INITIALIZED = "WITHDRAWAL_PROVIDER_INITIALIZED"',
], "Provider event chain missing");
hasAll(actions, [
    "CREATOR_WITHDRAWAL_PROVIDER_INITIALIZED",
], "Provider initialization audit missing");
hasAll(error, [
    "WITHDRAWAL_PROVIDER_WITHDRAWAL_MISSING",
    "WITHDRAWAL_PROVIDER_RESERVATION_MISSING",
    "WITHDRAWAL_PROVIDER_DESTINATION_MISSING",
    "WITHDRAWAL_PROVIDER_PROVIDER_CONFLICT",
    "WITHDRAWAL_PROVIDER_IDENTITY_CONFLICT",
    "WITHDRAWAL_PROVIDER_EVENT_CONFLICT",
    "WITHDRAWAL_PROVIDER_TRANSACTION_CONFLICT",
    "WITHDRAWAL_PROVIDER_REPLAY_CONFLICT",
], "Provider initialization error contract incomplete");
for (const forbidden of [
    "ledgerService",
    "walletProjectionService",
    "InternalPayoutModel",
    "providerPayoutService",
    "bank transfer",
    "UPI transfer",
    "ProviderPayoutStatus.PROCESSING",
    "ProviderPayoutStatus.COMPLETED",
]) {
    expect(!service.includes(forbidden), `Phase 9B contains forbidden side effect or execution: ${forbidden}`);
}
expect(!/Wallet\.(update|findOneAndUpdate|findByIdAndUpdate|create)/.test(service), "Phase 9B service mutates Wallet.");
expect(!/LedgerEntry\.(create|update|findOneAndUpdate)/.test(service), "Phase 9B service mutates Ledger.");
hasAll(tests, [
    "initializes one immutable provider authority without moving money",
    "never duplicates authority, events, or audit",
    "ten simultaneous initializations converge",
    "every injected initialization interruption rolls back",
    "performs no provider execution",
], "Phase 9B runtime proof incomplete");
expect(packageJson.includes('"validate:phase9b"') &&
    packageJson.includes('"test:phase9b"'), "Phase 9B package commands missing.");
expect(node_fs_1.default.existsSync(node_path_1.default.join(workspace, "docs/implementation/phase-9b-withdrawal-provider-initialization.md")), "Phase 9B documentation missing.");
console.log("Phase 9B withdrawal provider initialization static validation passed; MongoDB behavior requires test:phase9b.");
