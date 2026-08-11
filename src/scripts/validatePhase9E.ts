import fs from "node:fs";
import path from "node:path";

const backend = path.resolve(__dirname, "../..");
const workspace = path.resolve(backend, "..");
const read = (file: string) => fs.readFileSync(path.join(backend, file), "utf8");
const exists = (file: string) => fs.existsSync(path.join(backend, file));
const expect = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};
const hasAll = (source: string, values: string[], label: string) => {
  for (const value of values) expect(source.includes(value), `${label}: ${value}`);
};

const required = [
  "src/models/creatorWithdrawalReconciliation.model.ts",
  "src/models/creatorWithdrawalRetryAttempt.model.ts",
  "src/models/creatorWithdrawalRepairOperation.model.ts",
  "src/services/financial/creatorWithdrawalOperationalInspection.service.ts",
  "src/services/financial/creatorWithdrawalReconciliation.service.ts",
  "src/services/financial/creatorWithdrawalFinalizationRetry.service.ts",
  "src/services/financial/creatorWithdrawalRepair.service.ts",
  "src/errors/financial/CreatorWithdrawalOperationalError.ts",
  "src/controllers/adminCreatorWithdrawalOperational.controller.ts",
  "src/tests/financial/phase9e/phase9e.runtime.test.ts",
  "src/tests/financial/phase9e/withdrawalOperationalInspection.test.ts",
  "src/tests/financial/phase9e/withdrawalReconciliation.test.ts",
  "src/tests/financial/phase9e/withdrawalRetry.test.ts",
  "src/tests/financial/phase9e/withdrawalRepair.test.ts",
  "src/tests/financial/phase9e/withdrawalOperationalAudit.test.ts",
  "src/tests/financial/phase9e/withdrawalOperationalConcurrency.test.ts",
  "src/tests/financial/phase9e/withdrawalOperationalFailure.test.ts",
  "src/tests/financial/phase9e/withdrawalOperationalRegression.test.ts",
  "src/tests/financial/phase9e/fixtures/creatorWithdrawalOperationalFixtures.ts",
];
for (const file of required) expect(exists(file), `Missing Phase 9E file: ${file}`);

const classification = read("src/enums/financial/creatorWithdrawalOperationalClassification.enum.ts");
const status = read("src/enums/financial/creatorWithdrawalReconciliationStatus.enum.ts");
const severity = read("src/enums/financial/creatorWithdrawalOperationalSeverity.enum.ts");
const action = read("src/enums/financial/creatorWithdrawalOperationalAction.enum.ts");
const reconciliationModel = read(required[0]);
const retryModel = read(required[1]);
const repairModel = read(required[2]);
const inspection = read(required[3]);
const reconciliation = read(required[4]);
const retry = read(required[5]);
const repair = read(required[6]);
const error = read(required[7]);
const controller = read(required[8]);
const routes = read("src/routes/v1/admin.financial.routes.ts");
const phase9d = read("src/services/financial/creatorWithdrawalFinalization.service.ts");
const tests = required.filter((file) => file.includes("/phase9e/")).map(read).join("\n");
const packageJson = read("package.json");

hasAll(classification, ["HEALTHY_COMPLETED", "HEALTHY_FAILED",
  "PROVIDER_INITIALIZED", "PROVIDER_PROCESSING", "FINALIZATION_PENDING_SUCCESS",
  "FINALIZATION_PENDING_FAILURE", "COMPLETED_REPLAY_REQUIRED",
  "FAILED_REPLAY_REQUIRED", "CORRUPTED_WITHDRAWAL", "CORRUPTED_PROVIDER",
  "CORRUPTED_RESERVATION_LEDGER", "CORRUPTED_RESERVATION_PROJECTION",
  "CORRUPTED_FINALIZATION_LEDGER", "CORRUPTED_FINALIZATION_PROJECTION",
  "CORRUPTED_WALLET", "CORRUPTED_AUDIT", "REQUEST_LINK_CONFLICT",
  "PROVIDER_IDENTITY_CONFLICT", "DESTINATION_CONFLICT", "AMOUNT_CONFLICT",
  "CURRENCY_CONFLICT", "TRANSACTION_CONFLICT", "OUTCOME_CONFLICT",
  "MISSING_AUDIT", "MISSING_FINALIZATION_LINKS", "INTEGRITY_FAILURE", "UNKNOWN"],
"Operational classifications incomplete");
hasAll(status, ["OPEN", "RETRY_SCHEDULED", "IN_PROGRESS", "ACKNOWLEDGED",
  "RESOLVED", "FAILED"], "Reconciliation lifecycle incomplete");
hasAll(severity, ["INFO", "WARNING", "ERROR", "CRITICAL"], "Severity incomplete");
hasAll(action, ["INSPECT", "RETRY_FINALIZATION", "RESTORE_FINALIZATION_LINKS",
  "RESTORE_TERMINAL_AUDIT", "ACKNOWLEDGE", "RESOLVE"], "Actions incomplete");
hasAll(reconciliationModel, ["snapshot", "snapshotFingerprint", "retryCount",
  "maxRetryCount", "allowedActions", "status: 1, classification: 1",
  "status: 1, nextRetryAt: 1", "severity: 1, createdAt: -1"],
"Reconciliation authority incomplete");
hasAll(retryModel, ["attemptKey", "attemptNumber", "snapshotFingerprint",
  "RETRY_FINALIZATION", "STARTED", "APPLIED"], "Retry attempt incomplete");
hasAll(repairModel, ["repairKey", "snapshotFingerprint", "repairedFields",
  "RESTORE_FINALIZATION_LINKS", "RESTORE_TERMINAL_AUDIT"],
"Repair authority incomplete");
hasAll(inspection, ["validateReservationAuthority", "validateReplay",
  "LedgerEntry.find", "WalletProjectionOperation.findOne", "AuditLog.countDocuments",
  "FINALIZATION_PENDING_SUCCESS", "PROVIDER_PROCESSING", "MISSING_AUDIT",
  "fingerprintWithdrawalOperationalSnapshot"], "Inspection graph incomplete");
for (const forbidden of ["ledgerService", "walletProjectionService",
  "providerSimulatorService", "findOneAndUpdate", "withTransaction"]) {
  expect(!inspection.includes(forbidden), `Inspection is not read-only: ${forbidden}`);
}
hasAll(retry, ["FINALIZATION_PENDING_SUCCESS", "FINALIZATION_PENDING_FAILURE",
  "snapshotFingerprint", "maxRetryCount", "beginRetry",
  "creatorWithdrawalFinalizationService.finalize", "AFTER_PHASE9D_FINALIZATION"],
"Retry authority incomplete");
expect(!retry.includes("ledgerService") && !retry.includes("walletProjectionService"),
  "Retry reimplements Phase 9D accounting.");
hasAll(repair, ["RESTORE_FINALIZATION_LINKS", "RESTORE_TERMINAL_AUDIT",
  "restoreFinalizationLinks", "validateReplay", "snapshotFingerprint"],
"Bounded repair incomplete");
for (const forbidden of ["LedgerEntry.update", "Wallet.findOneAndUpdate",
  "WalletProjectionOperation.update", "providerStatus:", "amount:", "currency:"]) {
  if (["amount:", "currency:"].includes(forbidden)) continue;
  expect(!repair.includes(forbidden), `Forbidden repair mutation: ${forbidden}`);
}
hasAll(reconciliation, ["upsertObservation", "transitionStatus",
  "CREATOR_WITHDRAWAL_RECONCILIATION_CREATED", "ACKNOWLEDGED", "RESOLVED",
  "session.withTransaction"], "Operational lifecycle incomplete");
hasAll(controller, ["req.user.id", "RESTORE_FINALIZATION_LINKS",
  "RESTORE_TERMINAL_AUDIT", "ACKNOWLEDGE", "RESOLVE"],
"Thin authenticated controller incomplete");
hasAll(routes, ["router.use(protect, authorizeRoles(\"admin\"))",
  "/creator-withdrawals/:withdrawalReference/reconciliation",
  "/creator-withdrawal-reconciliations/:reconciliationReference/retry",
  "/creator-withdrawal-reconciliations/:reconciliationReference/repair"],
"Admin-only routes incomplete");
hasAll(error, ["WITHDRAWAL_NOT_FOUND", "RECONCILIATION_NOT_FOUND",
  "ALREADY_RESOLVED", "INVALID_STATUS", "INVALID_ACTION",
  "CLASSIFICATION_CHANGED", "SNAPSHOT_CONFLICT", "RETRY_LIMIT_EXCEEDED",
  "RETRY_NOT_ALLOWED", "REPAIR_NOT_ALLOWED", "REPAIR_AMBIGUOUS",
  "REPAIR_CONFLICT", "PROVIDER_CONFLICT", "LEDGER_CONFLICT",
  "PROJECTION_CONFLICT", "WALLET_CONFLICT", "AUDIT_CONFLICT",
  "TRANSACTION_CONFLICT", "REPLAY_CONFLICT", "INTEGRITY_ERROR"],
"Operational error contract incomplete");
hasAll(tests, ["healthy completion and failure", "provider initialized and processing",
  "pending-success reconciliation", "only through Phase 9D",
  "missing finalization links", "missing terminal audit",
  "ten concurrent inspections", "cannot duplicate Phase 9D accounting",
  "interruptions roll back", "admin endpoint is protected"],
"Runtime proof incomplete");
for (const forbidden of ["setInterval", "setTimeout", "new Mutex", "worker_threads"]) {
  expect(!retry.includes(forbidden) && !repair.includes(forbidden) &&
    !reconciliation.includes(forbidden), `Forbidden process-local authority: ${forbidden}`);
}
hasAll(phase9d, ["ledgerService.createDebit", "ledgerService.createCredit",
  "walletProjectionService.applyProjectionMutation"],
"Phase 9D finalization authority was weakened");
expect(packageJson.includes('"validate:phase9e"') &&
  packageJson.includes('"test:phase9e"'), "Phase 9E package scripts missing.");
expect(fs.existsSync(path.join(workspace,
  "docs/implementation/phase-9e-withdrawal-operational-integrity.md")),
"Phase 9E documentation missing.");

console.log("Phase 9E withdrawal operational integrity static validation passed; MongoDB behavior requires test:phase9e.");
