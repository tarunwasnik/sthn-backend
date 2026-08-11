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
const classification = read("enums", "financial", "walletConversionOperationalClassification.enum.ts");
const action = read("enums", "financial", "walletConversionRepairAction.enum.ts");
const audit = read("enums", "financial", "walletConversionAuditAction.enum.ts");
const inspection = read("services", "financial", "walletConversionOperationalInspection.service.ts");
const reconciliation = read("services", "financial", "walletConversionReconciliation.service.ts");
const retry = read("services", "financial", "walletConversionRetry.service.ts");
const repair = read("services", "financial", "walletConversionRepair.service.ts");
const repository = read("repositories", "walletConversionRequest.repository.ts");
const dto = read("dtos", "wallet", "walletConversionOperational.response.dto.ts");
const routes = read("routes", "v1", "admin.financial.routes.ts");
const packageJson = fs_1.default.readFileSync(path_1.default.join(backend, "package.json"), "utf8");
const testRoot = path_1.default.join(src, "tests", "financial", "phase10j");
const testFiles = fs_1.default.readdirSync(testRoot, { recursive: true })
    .filter((entry) => typeof entry === "string" &&
    entry.endsWith(".ts"));
const tests = testFiles.map((entry) => fs_1.default.readFileSync(path_1.default.join(testRoot, entry), "utf8")).join("\n");
const exactClassifications = ["HEALTHY", "REPLAY_REQUIRED", "PENDING",
    "CORRUPTED_LEDGER", "CORRUPTED_PROJECTION", "CORRUPTED_REQUEST",
    "CORRUPTED_PROVIDER", "CORRUPTED_SNAPSHOT", "MISSING_AUDIT",
    "INTEGRITY_FAILURE", "UNKNOWN"];
expect(all(classification, exactClassifications) &&
    (classification.match(/ = "/g) ?? []).length === 11, "Phase 10J classification contract is not exact.");
expect(all(action, ["RESTORE_MISSING_AUDIT", "RESTORE_LEDGER_REFERENCES",
    "RESTORE_PROJECTION_REFERENCES", "RESTORE_ACCOUNTING_REFERENCES"]), "Phase 10J bounded repair actions are incomplete.");
expect(all(inspection, ["WalletConversionRequest", "validateStoredAuthority",
    "validateReplay", "findManyWithPostingKeys", "findByOperationKey",
    "projectionVersion", "accountingFingerprint", "MISSING_AUDIT"]), "Phase 10J operational inspection or replay graph is incomplete.");
expect(all(reconciliation, ["upsertInspection", "withTransaction",
    "AFTER_RECONCILIATION", "BEFORE_AUDIT", "BEFORE_COMMIT",
    "validateReplay"]), "Phase 10J reconciliation is incomplete.");
expect(all(retry, ["retryCompleteCommittedAccounting", "AFTER_RETRY",
    "validateReplay", "walletConversionRetryAttemptRepository"]) &&
    !/ledgerService|walletProjectionService|executeProvider|\.account\(/.test(retry), "Phase 10J retry mutates financial authority or is incomplete.");
expect(all(repair, ["restoreLedgerReferences", "restoreProjectionReferences",
    "restoreAccountingReferences", "RESTORE_MISSING_AUDIT", "AFTER_REPAIR",
    "validateReplay"]) &&
    !/ledgerService|walletProjectionService|applyConditionalDelta|executeProvider/.test(repair), "Phase 10J repair exceeds its bounded metadata contract.");
expect(all(repository, ["retryCompleteCommittedAccounting",
    "restoreLedgerReferences", "restoreProjectionReferences",
    "restoreAccountingReferences", "WalletConversionRequestStatus.COMPLETED"]), "Phase 10J guarded metadata repository methods are missing.");
expect(all(audit, ["WALLET_CONVERSION_RECONCILED",
    "WALLET_CONVERSION_RETRY", "WALLET_CONVERSION_REPAIRED"]), "Phase 10J operational audit actions are missing.");
expect(all(dto, ["conversionReference", "classification", "severity",
    "issues", "retryPerformed", "repairPerformed"]) &&
    !/fingerprint|walletId|ledgerId|projectionId|internalId/.test(dto), "Phase 10J DTO is incomplete or unsafe.");
expect(routes.includes("/wallet-conversion-requests/:conversionReference/reconciliation") &&
    routes.includes("/wallet-conversion-reconciliations/:reconciliationReference/retry") &&
    routes.includes("/wallet-conversion-reconciliations/:reconciliationReference/repair") &&
    routes.includes('authorizeRoles("admin")'), "Phase 10J Admin-only routes are incomplete.");
expect(all(tests, ["ten concurrent reconciliation", "ten retry attempts",
    "ten repairs", "AFTER_RECONCILIATION", "AFTER_RETRY", "AFTER_REPAIR",
    "BEFORE_AUDIT", "BEFORE_COMMIT", "captureFinancialState",
    "CORRUPTED_LEDGER", "CORRUPTED_PROJECTION", "CORRUPTED_SNAPSHOT",
    "CORRUPTED_PROVIDER", "Admin route enforces authorization"]), "Phase 10J runtime proof is incomplete.");
for (const file of ["phase10j.runtime.test.ts",
    "walletConversionReconciliation.test.ts", "walletConversionRetry.test.ts",
    "walletConversionRepair.test.ts", "walletConversionAudit.test.ts",
    "walletConversionRegression.test.ts"]) {
    expect(testFiles.some((candidate) => candidate.endsWith(file)), `Required Phase 10J runtime file is missing: ${file}`);
}
expect(packageJson.includes('"validate:phase10j"') &&
    packageJson.includes('"test:phase10j"'), "Phase 10J package commands are missing.");
expect(fs_1.default.existsSync(path_1.default.join(workspace, "docs", "implementation", "phase-10j-wallet-conversion-operational-integrity.md")), "Phase 10J documentation is missing.");
console.log("Phase 10J wallet-conversion operational-integrity validation passed.");
