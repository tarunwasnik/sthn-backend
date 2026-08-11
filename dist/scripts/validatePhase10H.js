"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const src = path_1.default.resolve(__dirname, "..");
const backend = path_1.default.resolve(src, "..");
const workspace = path_1.default.resolve(backend, "..");
const read = (...parts) => fs_1.default.readFileSync(path_1.default.join(src, ...parts), "utf8");
const expect = (condition, message) => {
    if (!condition)
        throw new Error(message);
};
const all = (source, values) => values.every((value) => source.includes(value));
const providerStatus = read("enums", "financial", "internalWalletConversionProviderRequestStatus.enum.ts");
const requestStatus = read("enums", "financial", "walletConversionRequestStatus.enum.ts");
const outcome = read("enums", "financial", "walletConversionProviderOutcome.enum.ts");
const model = read("models", "internalProvider", "internalWalletConversionProviderRequest.model.ts");
const requestModel = read("models", "walletConversionRequest.model.ts");
const repository = read("repositories", "internalProvider", "internalWalletConversionProviderRequest.repository.ts");
const requestRepository = read("repositories", "walletConversionRequest.repository.ts");
const identity = read("utils", "financial", "walletConversionProviderIdentity.util.ts");
const service = read("services", "financial", "walletConversionProviderExecution.service.ts");
const requestService = read("services", "financial", "walletConversionRequest.service.ts");
const simulator = read("services", "providerSimulator", "providerSimulator.service.ts");
const eventType = read("constants", "internalProvider", "providerEventType.enum.ts");
const entityType = read("constants", "internalProvider", "providerEntityType.enum.ts");
const operation = read("constants", "internalProvider", "providerOperation.enum.ts");
const auditAction = read("enums", "financial", "walletConversionAuditAction.enum.ts");
const controller = read("controllers", "adminWalletConversionProviderExecution.controller.ts");
const routes = read("routes", "v1", "admin.financial.routes.ts");
const dto = read("dtos", "wallet", "walletConversionProviderExecution.response.dto.ts");
const packageJson = fs_1.default.readFileSync(path_1.default.join(backend, "package.json"), "utf8");
const testRoot = path_1.default.join(src, "tests", "financial", "phase10h");
const testFiles = fs_1.default.readdirSync(testRoot, { recursive: true })
    .filter((entry) => typeof entry === "string" &&
    entry.endsWith(".ts"));
const tests = testFiles.map((entry) => fs_1.default.readFileSync(path_1.default.join(testRoot, entry), "utf8")).join("\n");
expect(all(providerStatus, ["INITIALIZED", "PROCESSING", "SUCCEEDED",
    "FAILED"]) && (providerStatus.match(/=\s*"/g) ?? []).length === 4 &&
    !/CANCEL|RETRY|REVERSE/.test(providerStatus), "Phase 10H provider lifecycle is not bounded.");
expect(all(requestStatus, ["PENDING", "APPROVED", "REJECTED"]) &&
    !/PROCESSING|CANCELLED/.test(requestStatus), "WalletConversionRequest incorrectly contains provider execution states.");
expect(all(outcome, ['SUCCESS = "SUCCESS"', 'FAILURE = "FAILURE"']) &&
    (outcome.match(/=\s*"/g) ?? []).length === 2, "Provider outcome is not bounded.");
expect(all(model, ["InternalWalletConversionProviderRequest",
    "providerRequestReference", "providerRequestKey", "conversionReference",
    "userId", "sourceWalletId", "targetWalletId", "sourceCurrency",
    "targetCurrency", "sourceAmount", "targetAmount", "fxSnapshotReference",
    "fxProvider", "fxEffectiveDate", "providerExecutionReference",
    "providerFingerprint", "executionFingerprint", "immutable: true",
    "providerStatus", "providerOutcome", "processingAt", "completedAt"]), "Internal conversion provider authority or immutable identity is incomplete.");
expect(all(identity, ["conversionReference", "userId", "sourceWalletId",
    "targetWalletId", "sourceCurrency", "targetCurrency", "sourceAmount",
    "targetAmount", "fxSnapshotReference", "fxProvider", "fxEffectiveDate",
    "providerExecutionReference", "providerFingerprint",
    "executionFingerprint"]), "Deterministic provider identity omits required conversion authority.");
expect(all(repository, ["createInitialized", "markProcessing", "markTerminal",
    "providerStatus:", "INITIALIZED", "PROCESSING", "expectedVersion",
    "isTerminal: false"]) &&
    !/genericUpdate|setStatus|delete|remove/.test(repository), "Provider repository transitions are not narrow and guarded.");
expect(all(requestRepository, ["synchronizeProviderTerminal",
    "status: WalletConversionRequestStatus.APPROVED",
    "providerRequestReference: { $exists: false }"]) &&
    !/status:\s*WalletConversionRequestStatus\.PROCESSING/
        .test(requestRepository.split("completeApprovedWithAccounting")[0]), "Terminal request synchronization is not guarded or preserves no lifecycle.");
expect(all(service, ["resolveApproved", "WalletConversionRequestStatus.APPROVED",
    "validateStoredAuthority", "checkSourceBalance: false",
    "requireSnapshotEligible: false", "ensureInitialized", "markProcessing",
    "simulateWalletConversionProvider", "markTerminal",
    "synchronizeProviderTerminal", "validateReplay"]), "Approved request validation or provider execution flow is incomplete.");
expect(all(requestService, ["validateStoredAuthority", "validateStoredSnapshot",
    "requestFingerprint", "fxSnapshotReference"]), "Phase 10F/10E immutable graph validation is not reused.");
expect(!/lookupOrRefresh|forceRefresh|\.refresh\(|requireCurrentSnapshot/.test(service), "Phase 10H refreshes or replaces FX authority.");
expect(all(simulator, ["simulateWalletConversionProvider",
    "INTERNAL_CONVERSION_SUCCEEDED", "INTERNAL_CONVERSION_FAILED"]), "Deterministic Internal Provider simulation is missing.");
expect(all(eventType, ["CONVERSION_PROVIDER_CREATED",
    "CONVERSION_PROVIDER_INITIALIZED", "CONVERSION_PROVIDER_PROCESSING",
    "CONVERSION_PROVIDER_SUCCEEDED", "CONVERSION_PROVIDER_FAILED"]) &&
    entityType.includes("WALLET_CONVERSION_PROVIDER_REQUEST") &&
    all(operation, ["CREATE_CONVERSION_PROVIDER_REQUEST",
        "INITIALIZE_CONVERSION_PROVIDER_REQUEST",
        "PROCESS_CONVERSION_PROVIDER_REQUEST",
        "SUCCEED_CONVERSION_PROVIDER_REQUEST",
        "FAIL_CONVERSION_PROVIDER_REQUEST"]), "Conversion-specific provider event architecture is incomplete.");
expect(all(auditAction, ["WALLET_CONVERSION_PROVIDER_STARTED",
    "WALLET_CONVERSION_PROVIDER_SUCCEEDED",
    "WALLET_CONVERSION_PROVIDER_FAILED"]) &&
    all(service, ["PROVIDER_STARTED", "PROVIDER_SUCCEEDED", "PROVIDER_FAILED",
        "createOnce"]), "Provider audit chain is incomplete.");
expect(all(service, ["withTransaction", "AFTER_AUTHORITY",
    "AFTER_PROCESSING", "AFTER_EVENT_CREATION", "AFTER_TERMINAL_STATE",
    "BEFORE_REQUEST_SYNCHRONIZATION", "BEFORE_AUDIT", "BEFORE_COMMIT"]), "Transaction or rollback injection boundary is incomplete.");
expect(all(controller, ["req.user.id", "Object.keys", "outcome",
    "failureCode", "failureReason"]) &&
    !/req\.body\.(adminId|userId|status|sourceAmount|targetAmount|providerReference|snapshotReference)/
        .test(controller), "Authenticated strict execution input is incomplete.");
expect(all(routes, ["authorizeRoles(\"admin\")",
    "/wallet-conversion-requests/:conversionReference/execute-provider"]), "Admin-only provider execution route is missing.");
expect(all(dto, ["conversionReference", "providerReference", "providerStatus",
    "providerOutcome", "processingAt", "completedAt"]) &&
    !/userId|WalletId|fingerprint|key|payload|failureReason|metadata/.test(dto), "Provider execution DTO is unsafe or incomplete.");
expect(!new RegExp(["LedgerEntry", "ledgerService", "WalletProjection",
    "walletProjectionService", "applyConditionalDelta", "createWallet",
    "Booking", "Payment", "Settlement", "Withdrawal", "TopUp", "Refund"]
    .join("|")).test(service), "Phase 10H service mutates accounting or another financial domain.");
expect(all(tests, ["successful execution", "failed execution",
    "terminal replay", "never invokes simulator", "ten attempts converge",
    "AFTER_AUTHORITY", "AFTER_PROCESSING", "AFTER_EVENT_CREATION",
    "AFTER_TERMINAL_STATE", "BEFORE_REQUEST_SYNCHRONIZATION", "BEFORE_AUDIT",
    "BEFORE_COMMIT", "only APPROVED", "corrupted request and snapshot",
    "corrupted provider identity", "Admin route", "authorization",
    "no-money-movement", "collection.indexes"]), "Required Phase 10H runtime proof is incomplete.");
for (const file of ["phase10h.runtime.test.ts",
    "walletConversionProviderExecution.test.ts",
    "walletConversionProviderReplay.test.ts",
    "walletConversionProviderConcurrency.test.ts",
    "walletConversionProviderFailure.test.ts",
    "walletConversionProviderRegression.test.ts",
    "walletConversionProviderIntegrity.test.ts"]) {
    expect(testFiles.some((candidate) => candidate.endsWith(file)), `Required Phase 10H runtime file is missing: ${file}`);
}
expect(packageJson.includes('"validate:phase10h"') &&
    packageJson.includes('"test:phase10h"'), "Phase 10H package commands are missing.");
expect(fs_1.default.existsSync(path_1.default.join(workspace, "docs", "implementation", "phase-10h-wallet-conversion-provider-execution.md")), "Phase 10H documentation is missing.");
console.log("Phase 10H Internal Provider conversion execution validation passed; MongoDB behavior requires test:phase10h.");
