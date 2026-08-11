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
const status = read("enums", "financial", "walletConversionRequestStatus.enum.ts");
const ledgerType = read("enums", "financial", "ledgerEntryType.enum.ts");
const ledgerSource = read("enums", "financial", "ledgerSource.enum.ts");
const auditAction = read("enums", "financial", "walletConversionAuditAction.enum.ts");
const requestModel = read("models", "walletConversionRequest.model.ts");
const repository = read("repositories", "walletConversionRequest.repository.ts");
const identity = read("utils", "financial", "walletConversionAccountingIdentity.util.ts");
const service = read("services", "financial", "walletConversionAccounting.service.ts");
const dto = read("dtos", "wallet", "walletConversionAccounting.response.dto.ts");
const controller = read("controllers", "adminWalletConversionAccounting.controller.ts");
const routes = read("routes", "v1", "admin.financial.routes.ts");
const packageJson = fs_1.default.readFileSync(path_1.default.join(backend, "package.json"), "utf8");
const testRoot = path_1.default.join(src, "tests", "financial", "phase10i");
const testFiles = fs_1.default.readdirSync(testRoot, { recursive: true })
    .filter((entry) => typeof entry === "string" &&
    entry.endsWith(".ts"));
const tests = testFiles.map((entry) => fs_1.default.readFileSync(path_1.default.join(testRoot, entry), "utf8")).join("\n");
expect(all(status, ['APPROVED = "APPROVED"', 'COMPLETED = "COMPLETED"',
    'FAILED = "FAILED"']) && !/PROCESSING|CANCELLED/.test(status), "Phase 10I request terminal lifecycle is not bounded.");
expect(ledgerType.includes("WALLET_CONVERSION_COMPLETED") &&
    ledgerSource.includes("WALLET_CONVERSION"), "Conversion-specific Ledger type or source is missing.");
expect(all(requestModel, ["accountingReference", "accountingKey",
    "accountingFingerprint", "accountingTransactionReference",
    "accountingTargetWalletId", "sourceProjectionReference",
    "targetProjectionReference", "sourceWalletVersion", "targetWalletVersion",
    "completedAt", "failedAt"]), "Wallet conversion accounting authority fields are incomplete.");
expect(all(repository, ["completeApprovedWithAccounting",
    "failApprovedFromProvider", "WalletConversionRequestStatus.APPROVED",
    'providerStatus: "SUCCEEDED"', 'providerStatus: "FAILED"',
    "accountingReference: { $exists: false }"]) &&
    !/genericUpdate|setStatus|delete|remove/.test(repository), "Accounting repository transitions are not narrow and guarded.");
expect(all(identity, ["conversionReference", "conversionKey",
    "providerRequestReference", "providerExecutionReference",
    "fxSnapshotReference", "sourceWalletId", "targetWalletId",
    "sourceCurrency", "targetCurrency", "sourceAmount", "targetAmount",
    "accountingReference", "accountingTransactionReference",
    "accountingFingerprint", "sourcePostingKey", "targetPostingKey",
    "sourceProjectionKey", "targetProjectionKey"]), "Deterministic conversion accounting identity is incomplete.");
expect(all(service, ["walletCreationService.createWallet", "ledgerService",
    "createDebit", "createCredit", "LedgerAccount.WALLET_AVAILABLE",
    "walletProjectionService", "applyProjectionMutation",
    "availableBalance: -request.sourceAmount",
    "availableBalance: request.targetAmount",
    "completeApprovedWithAccounting", "failApprovedFromProvider",
    "validateReplay", "withTransaction"]), "Conversion Ledger, Wallet creation, projection, or replay flow is incomplete.");
expect(all(service, ["AFTER_WALLET_CREATION", "AFTER_LEDGER",
    "AFTER_SOURCE_PROJECTION", "AFTER_TARGET_PROJECTION", "BEFORE_COMPLETED",
    "BEFORE_AUDIT", "BEFORE_COMMIT"]), "Required Phase 10I rollback boundaries are incomplete.");
expect(!/lookupOrRefresh|forceRefresh|\.refresh\(|simulateWalletConversionProvider|Wallet\.findOneAndUpdate|Wallet\.update/.test(service), "Phase 10I refreshes FX, invokes the provider, or mutates Wallet directly.");
expect(all(auditAction, ["WALLET_CONVERSION_COMPLETED",
    "WALLET_CONVERSION_FAILED"]) &&
    all(service, ["WalletConversionAuditAction.COMPLETED",
        "WalletConversionAuditAction.FAILED", "createOnce"]), "Phase 10I completion/failure audit is incomplete.");
expect(all(dto, ["conversionReference", "status", "sourceCurrency",
    "targetCurrency", "sourceAmount", "targetAmount", "completedAt"]) &&
    !/userId|walletId|projectionReference|transactionReference|fingerprint|key/.test(dto), "Phase 10I accounting DTO is unsafe or incomplete.");
expect(all(controller, ["req.user", "Object.keys(req.body).length",
    "walletConversionAccountingService.account"]) &&
    routes.includes("/wallet-conversion-requests/:conversionReference/complete-accounting") &&
    routes.includes('authorizeRoles("admin")'), "Phase 10I Admin-only empty-body accounting route is incomplete.");
expect(all(tests, ["cross-currency Ledger and Wallet accounting",
    "completed replay", "ten attempts converge", "target-Wallet race",
    "provider failure", "AFTER_WALLET_CREATION", "AFTER_LEDGER",
    "AFTER_SOURCE_PROJECTION", "AFTER_TARGET_PROJECTION", "BEFORE_COMPLETED",
    "BEFORE_AUDIT", "BEFORE_COMMIT", "insufficient source Wallet",
    "corrupted provider identity", "unrelated financial domains",
    "Admin accounting route"]), "Required Phase 10I runtime proof is incomplete.");
for (const file of ["phase10i.runtime.test.ts",
    "walletConversionAccounting.test.ts", "walletConversionReplay.test.ts",
    "walletConversionConcurrency.test.ts",
    "walletConversionTargetWalletRace.test.ts",
    "walletConversionFailure.test.ts", "walletConversionRollback.test.ts",
    "walletConversionIntegrity.test.ts", "walletConversionRegression.test.ts"]) {
    expect(testFiles.some((candidate) => candidate.endsWith(file)), `Required Phase 10I runtime file is missing: ${file}`);
}
expect(packageJson.includes('"validate:phase10i"') &&
    packageJson.includes('"test:phase10i"'), "Phase 10I package commands are missing.");
expect(fs_1.default.existsSync(path_1.default.join(workspace, "docs", "implementation", "phase-10i-wallet-conversion-accounting.md")), "Phase 10I documentation is missing.");
console.log("Phase 10I cross-currency accounting validation passed; MongoDB behavior requires test:phase10i.");
