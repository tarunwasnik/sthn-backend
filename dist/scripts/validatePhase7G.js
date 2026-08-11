"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const root = path_1.default.resolve(__dirname, "../..");
const workspace = path_1.default.resolve(root, "..");
const read = (file) => fs_1.default.readFileSync(path_1.default.join(root, file), "utf8");
const expect = (condition, message) => {
    if (!condition)
        throw new Error(message);
};
const all = (source, markers) => markers.every((marker) => source.includes(marker));
const classifications = read("src/enums/financial/walletTopUpReconciliationClassification.enum.ts");
const actions = read("src/enums/financial/walletTopUpOperationalAction.enum.ts");
const statuses = read("src/enums/financial/walletTopUpReconciliationStatus.enum.ts");
const model = read("src/models/walletTopUpReconciliation.model.ts");
const attemptModel = read("src/models/walletTopUpRetryAttempt.model.ts");
const repairModel = read("src/models/walletTopUpRepairOperation.model.ts");
const auditModel = read("src/models/walletTopUpOperationalAudit.model.ts");
const requestModel = read("src/models/walletTopUpRequest.model.ts");
const requestRepository = read("src/repositories/walletTopUpRequest.repository.ts");
const reconciliationRepository = read("src/repositories/walletTopUpReconciliation.repository.ts");
const inspector = read("src/services/financial/walletTopUpReconciliation.service.ts");
const failure = read("src/services/financial/walletTopUpProviderFailure.service.ts");
const retry = read("src/services/financial/walletTopUpRetry.service.ts");
const repair = read("src/services/financial/walletTopUpRepair.service.ts");
const audit = read("src/services/financial/walletTopUpOperationalAudit.service.ts");
const controller = read("src/controllers/adminWalletTopUpReconciliation.controller.ts");
const routes = read("src/routes/v1/admin.financial.routes.ts");
const errors = read("src/errors/financial/WalletTopUpReconciliationError.ts");
const identity = read("src/utils/financial/topUpOperationalIdentity.util.ts");
const policy = read("src/constants/financial/walletTopUpRetryPolicy.ts");
const phase7f = read("src/services/financial/topUpAccountingOrchestrator.service.ts");
const packageJson = read("package.json");
const documentation = fs_1.default.readFileSync(path_1.default.join(workspace, "docs/implementation/phase-7g-top-up-reconciliation-recovery.md"), "utf8");
for (const value of [
    "HEALTHY_COMPLETED", "RETRYABLE_PROVIDER_PENDING", "PROVIDER_FAILED",
    "ACCOUNTING_NOT_STARTED", "LEDGER_ONLY", "LEDGER_AND_PROJECTION",
    "COMPLETION_PENDING", "COMPLETED_VALID", "COMPLETED_CORRUPTED",
    "ORPHAN_PROJECTION", "LEDGER_CONFLICT", "PROJECTION_CONFLICT",
    "REQUEST_LINK_CONFLICT", "WALLET_CONFLICT", "AMOUNT_CONFLICT",
    "CURRENCY_CONFLICT", "TRANSACTION_CONFLICT", "UNKNOWN_INTEGRITY_FAILURE",
])
    expect(classifications.includes(`${value} = "${value}"`), `Missing classification ${value}.`);
for (const value of [
    "INSPECT", "FINALIZE_PROVIDER_FAILURE", "RETRY_ACCOUNTING", "RETRY_COMPLETION",
    "MARK_RECONCILIATION_REQUIRED", "REPAIR_REQUEST_LINKS", "REPAIR_PROJECTION_LINK",
    "REPAIR_LEDGER_LINK", "ACKNOWLEDGE_CORRUPTION", "RESOLVE_RECONCILIATION",
])
    expect(actions.includes(`${value} = "${value}"`), `Missing operational action ${value}.`);
for (const value of ["OPEN", "RETRY_SCHEDULED", "IN_PROGRESS", "RESOLVED", "ACKNOWLEDGED", "FAILED"]) {
    expect(statuses.includes(`${value} = "${value}"`), `Missing reconciliation status ${value}.`);
}
expect(all(model, [
    "reconciliationReference", "reconciliationKey", "topUpRequestId", "topUpReference",
    "providerFundingReference", "classification", "status", "severity", "detectedIssues",
    "recommendedAction", "allowedActions", "retryCount", "maxRetryCount",
    "nextRetryAt", "resolutionAction", "snapshot", "fingerprint", "version",
    "unique: true", "status: 1, classification: 1", "status: 1, nextRetryAt: 1",
    "select: false",
]), "Reconciliation durability, indexes, or protected snapshot fields are incomplete.");
expect(all(attemptModel, [
    "operationKey", "attemptNumber", "startedAt", "completedAt", "resultCode",
    "safeErrorCode", "nextRetryAt", "actorId", "unique: true",
]), "Retry-attempt persistence is incomplete.");
expect(all(repairModel, [
    "operationReference", "operationKey", "snapshotFingerprint", "repairedFields",
    "actorId", "APPLIED", "REJECTED", "unique: true",
]), "Repair idempotency persistence is incomplete.");
expect(all(auditModel, [
    "auditReference", "reconciliationReference", "action", "actorType", "actorId",
    "classificationBefore", "classificationAfter", "reasonCode", "metadata",
]), "Operational audit model is incomplete.");
expect(all(identity, [
    "request.topUpReference", "funding.fundingReference", "request.userId",
    "request.walletId", "request.amount", "request.currency", "createHash(\"sha256\")",
    "transactionId", "postingKey", "operationKey", "deterministicSnapshotFingerprint",
]), "Deterministic accounting or snapshot identity is incomplete.");
for (const forbidden of ["Math.random", "randomUUID", "Date.now", "new Date", "adminUserId"]) {
    expect(!identity.includes(forbidden), `Operational identity uses unstable authority ${forbidden}.`);
}
expect(all(inspector, [
    "walletTopUpRequestRepository.findByReferenceForAccounting",
    "internalTopUpFundingRepository.findByTopUpRequestId",
    "ledgerEntryRepository.findByPostingKey",
    "walletProjectionOperationRepository.findByOperationKey",
    "walletRepository.findById",
    "InternalTopUpFundingStatus.SUCCEEDED",
    "InternalTopUpFundingStatus.FAILED",
    "Classification.ACCOUNTING_NOT_STARTED",
    "Classification.LEDGER_ONLY",
    "Classification.COMPLETION_PENDING",
    "Classification.COMPLETED_VALID",
    "Classification.COMPLETED_CORRUPTED",
    "Classification.ORPHAN_PROJECTION",
    "Classification.LEDGER_CONFLICT",
    "Classification.PROJECTION_CONFLICT",
    "Classification.REQUEST_LINK_CONFLICT",
    "Classification.WALLET_CONFLICT",
    "Classification.AMOUNT_CONFLICT",
    "Classification.CURRENCY_CONFLICT",
    "Classification.TRANSACTION_CONFLICT",
    "upsertObservation",
    "deterministicSnapshotFingerprint",
]), "Read-only inspection or deterministic classification is incomplete.");
for (const forbidden of [
    "ledgerService.create", "createCredit", "applyProjectionMutation",
    "completeProcessingWithAccounting", "finalizeProcessingAsFailed",
    "repairMissingAccountingLinks", "markSucceeded", "markFailed", "recordEvent",
]) {
    expect(!inspector.includes(forbidden), `Inspection has forbidden financial mutation ${forbidden}.`);
}
expect(all(requestModel, [
    "failureCode", "failureReason", "providerFailedAt",
    "failureFinalizedAt", "failureFinalizedBy", "select: false",
]), "Bounded request failure metadata is incomplete.");
expect(all(requestRepository, [
    "finalizeProcessingAsFailed",
    "status: WalletTopUpRequestStatus.PROCESSING",
    "providerFundingId: input.providerFundingId",
    "providerFundingReference: input.providerFundingReference",
    "status: WalletTopUpRequestStatus.FAILED",
    "failureFinalizedAt", "failureFinalizedBy",
]), "PROCESSING to FAILED guard is incomplete.");
const failureMethod = failure.slice(failure.indexOf("async finalize("));
expect(all(failureMethod, [
    "InternalTopUpFundingStatus.FAILED", "Classification.PROVIDER_FAILED",
    "ledger || operation", "finalizeProcessingAsFailed",
    "WalletTopUpRequestStatus.FAILED", "WalletTopUpRequestStatus.COMPLETED",
    "topUpAccountingOrchestratorService.complete",
    "walletTopUpOperationalAuditService.record",
]), "Provider-terminal failure finalization or guard-loser handling is incomplete.");
expect(failure.includes("PROVIDER_FAILURE_CONFLICT"), "Provider failure conflict is not bounded.");
for (const forbidden of ["createCredit", "applyProjectionMutation", "markFailed", "recordEvent"]) {
    expect(!failure.includes(forbidden), `Provider failure finalization creates a financial effect via ${forbidden}.`);
}
expect(all(policy, [
    "MAX_ACCOUNTING_RETRIES", "BASE_RETRY_DELAY_MS", "MAX_RETRY_DELAY_MS",
    "Math.min", "2 **",
]), "Bounded persisted retry policy is incomplete.");
expect(all(retry, [
    "Classification.ACCOUNTING_NOT_STARTED", "Classification.LEDGER_ONLY",
    "Classification.LEDGER_AND_PROJECTION", "Classification.COMPLETION_PENDING",
    "loaded.retryCount >= loaded.maxRetryCount", "beginRetry", "SNAPSHOT_CONFLICT",
    "InternalTopUpFundingStatus.SUCCEEDED", "topUpAccountingOrchestratorService.complete",
    "inspectForOperation", "Classification.COMPLETED_VALID", "completeRetry",
    "walletTopUpRetryAttemptRepository", "nextRetryAt", "walletTopUpRetryDelay",
]), "Retry eligibility, Phase 7F reuse, reinspection, or metadata is incomplete.");
for (const forbidden of ["setTimeout(", "setInterval(", "while (", "for (;;)"]) {
    expect(!retry.includes(forbidden), `Retry system contains forbidden automatic loop ${forbidden}.`);
}
expect(all(repair, [
    "REPAIR_ACTIONS", "REPAIR_REQUEST_LINKS", "REPAIR_LEDGER_LINK",
    "REPAIR_PROJECTION_LINK", "loaded.fingerprint", "SNAPSHOT_CONFLICT",
    "findLatestApplied", "findByOperationKey", "repairMissingAccountingLinks",
    "ledgerEntryId", "ledgerReference", "walletProjectionOperationId",
    "walletProjectionOperationReference", "accountingTransactionId",
    "walletTopUpRepairOperationRepository", "walletTopUpOperationalAuditService.record",
]), "Allowlisted, snapshot-guarded, idempotent repair is incomplete.");
expect(!repair.includes("req.body") && !repair.includes("$set: req") &&
    !controller.includes("fieldValue") && !controller.includes("patch"), "Repair accepts an arbitrary field patch.");
expect(all(requestRepository, [
    "repairMissingAccountingLinks", "$exists: false", "{ [field]: null }",
    "expectedStatus", "providerFundingId", "providerFundingReference",
]), "Missing-link repair database guard is incomplete.");
expect(all(audit, ["actorType === \"ADMIN\"", "actorId", "reasonCode", "createdAt"]), "Operational audit identity or safe result recording is incomplete.");
expect(all(controller, [
    "req.user.id", "walletTopUpReconciliationService.inspect",
    "walletTopUpProviderFailureService.finalize", "walletTopUpRetryService.retry",
    "walletTopUpRepairService.repair", "walletTopUpReconciliationService.updateStatus",
    "Object.keys(req.body)", "WalletTopUpOperationalAction",
]), "Thin Admin controller boundaries or authenticated actor identity are incomplete.");
expect(!controller.includes("req.body.admin") && !controller.includes("adminUserId: req.body"), "Admin identity is accepted from the request body.");
expect(!controller.includes("WalletTopUpRequest.find") &&
    !controller.includes("WalletTopUpReconciliation.find"), "Admin controller accesses persistence directly.");
expect(all(routes, [
    "router.use(protect, authorizeRoles(\"admin\"))",
    '"/wallet-top-up-requests/:topUpReference/reconciliation"',
    '"/wallet-top-up-reconciliations"',
    '"/wallet-top-up-requests/:topUpReference/finalize-provider-failure"',
    '"/wallet-top-up-reconciliations/:reconciliationReference/retry"',
    '"/wallet-top-up-reconciliations/:reconciliationReference/repair"',
    '"/wallet-top-up-reconciliations/:reconciliationReference/status"',
]), "Required Admin-only operational routes are incomplete.");
for (const code of [
    "WALLET_TOP_UP_RECONCILIATION_NOT_FOUND",
    "WALLET_TOP_UP_RECONCILIATION_ALREADY_RESOLVED",
    "WALLET_TOP_UP_RECONCILIATION_INVALID_STATUS",
    "WALLET_TOP_UP_RECONCILIATION_INVALID_ACTION",
    "WALLET_TOP_UP_RECONCILIATION_CLASSIFICATION_CHANGED",
    "WALLET_TOP_UP_RECONCILIATION_SNAPSHOT_CONFLICT",
    "WALLET_TOP_UP_RECONCILIATION_RETRY_LIMIT_EXCEEDED",
    "WALLET_TOP_UP_RECONCILIATION_RETRY_NOT_ALLOWED",
    "WALLET_TOP_UP_RECONCILIATION_REPAIR_NOT_ALLOWED",
    "WALLET_TOP_UP_RECONCILIATION_REPAIR_AMBIGUOUS",
    "WALLET_TOP_UP_RECONCILIATION_REPAIR_CONFLICT",
    "WALLET_TOP_UP_RECONCILIATION_PROVIDER_FAILURE_CONFLICT",
    "WALLET_TOP_UP_RECONCILIATION_INTEGRITY_ERROR",
])
    expect(errors.includes(code), `Missing bounded reconciliation error ${code}.`);
const phase7gServices = [inspector, failure, retry, repair].join("\n");
for (const forbidden of [
    "Payment", "InternalPayment", "paymentLifecycle", "bookingRepository",
    "settlementService", "refundService", "withdrawalService", "payoutService",
    "Wallet.findOneAndUpdate", "applyConditionalDelta", "ProviderEventService",
    "new Map(", "Mutex", "globalLock", "sleep(", "Phase7H",
]) {
    expect(!phase7gServices.includes(forbidden), `Phase 7G crosses a forbidden boundary via ${forbidden}.`);
}
expect(all(phase7f, [
    "validateCompletedAccountingReplay", "establishOrReuseLedger",
    "establishOrReuseProjection", "completeProcessingOrRecover",
]), "Frozen Phase 7F orchestration behavior was removed.");
expect(packageJson.includes('"validate:phase7g": "node -r ts-node/register src/scripts/validatePhase7G.ts"'), "validate:phase7g package command is missing.");
for (const heading of [
    "Purpose", "Scope", "Frozen Phase 7F dependency", "Failure classifications",
    "Reconciliation lifecycle", "Failed-provider finalization", "Retry policy",
    "Safe repair allowlist", "Repair idempotency", "Snapshot fingerprinting",
    "Admin authorization", "Auditability", "Concurrency behavior", "Indexes",
    "API endpoints", "Error contract", "Security boundaries", "Deferred scheduler",
    "Deferred Phase 7H testing", "Migration notes", "Validation and build results",
])
    expect(documentation.includes(`## ${heading}`), `Phase 7G documentation missing ${heading}.`);
console.log("Phase 7G operational reconciliation validation passed.");
