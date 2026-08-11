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
const decision = read("enums", "financial", "walletConversionDecision.enum.ts");
const rejection = read("enums", "financial", "walletConversionRejectionCode.enum.ts");
const auditAction = read("enums", "financial", "walletConversionAuditAction.enum.ts");
const model = read("models", "walletConversionRequest.model.ts");
const auditModel = read("models", "walletConversionAudit.model.ts");
const repository = read("repositories", "walletConversionRequest.repository.ts");
const auditRepository = read("repositories", "walletConversionAudit.repository.ts");
const service = read("services", "financial", "adminWalletConversionDecision.service.ts");
const requestService = read("services", "financial", "walletConversionRequest.service.ts");
const fxService = read("services", "financial", "fxRateSnapshot.service.ts");
const controller = read("controllers", "adminWalletConversionDecision.controller.ts");
const routes = read("routes", "v1", "admin.financial.routes.ts");
const dto = read("dtos", "wallet", "walletConversionRequest.response.dto.ts");
const packageJson = fs_1.default.readFileSync(path_1.default.join(backend, "package.json"), "utf8");
const testRoot = path_1.default.join(src, "tests", "financial", "phase10g");
const testFiles = fs_1.default.readdirSync(testRoot, { recursive: true })
    .filter((entry) => typeof entry === "string" &&
    entry.endsWith(".ts"));
const tests = testFiles.map((entry) => fs_1.default.readFileSync(path_1.default.join(testRoot, entry), "utf8")).join("\n");
const production = [service, controller, repository].join("\n");
expect(all(status, ['PENDING = "PENDING"', 'APPROVED = "APPROVED"',
    'REJECTED = "REJECTED"']) &&
    !/PROCESSING|CANCELLED|EXPIRED/.test(status), "Phase 10G lifecycle is incomplete or includes an invalid state.");
expect(all(decision, ['APPROVE = "APPROVE"', 'REJECT = "REJECT"']) &&
    (decision.match(/=\s*"/g) ?? []).length === 2, "Wallet conversion decision enum is not bounded.");
expect(all(rejection, ["ADMIN_DECLINED", "INVALID_REQUEST",
    "FX_SNAPSHOT_NOT_ACCEPTABLE", "INSUFFICIENT_SOURCE_FUNDS",
    "SIMULATION_REJECTED", "OTHER"]), "Wallet conversion rejection-code enum is incomplete.");
expect(all(repository, ["approvePending", "rejectPending",
    "status: WalletConversionRequestStatus.PENDING",
    "WalletConversionRequestStatus.APPROVED",
    "WalletConversionRequestStatus.REJECTED", "findOneAndUpdate"]), "Guarded PENDING decision transitions are incomplete.");
expect(!/genericUpdate|updateStatus|setStatus|deleteRequest|removeRequest/.test(repository), "A generic request mutation method exists.");
expect(all(controller, ["req.user.id", "Object.keys", "decision",
    "rejectionCode", "rejectionReason"]) &&
    !/req\.body\.(adminId|decidedBy|decidedAt|status|sourceAmount|targetAmount|rate|fxSnapshotReference)/
        .test(controller), "Admin actor or strict body authority is invalid.");
expect(all(model, ["conversionReference", "conversionKey", "userId",
    "sourceWalletId", "targetWalletId", "sourceCurrency", "targetCurrency",
    "sourceAmount", "targetAmount", "fxSnapshotId", "fxSnapshotReference",
    "fxProvider", "fxEffectiveDate", "rateValue", "rateScale",
    "inverseRateValue", "inverseRateScale", "sourceMinorUnits",
    "targetMinorUnits", "idempotencyKey", "requestFingerprint",
    "requestedAt", "immutable: true", "decidedAt", "decidedBy",
    "rejectionCode", "rejectionReason"]), "Immutable request identity or narrow decision metadata is incomplete.");
expect(all(service, ["validateStoredAuthority", "requireSnapshotEligible",
    "checkSourceBalance", "requireApprovalEligibility",
    "WALLET_CONVERSION_SNAPSHOT_EXPIRED"]), "Approval snapshot eligibility or balance precheck is missing.");
expect(all(requestService, ["validateStoredAuthority",
    "requireStoredSnapshotEligible", "validateStoredSnapshot",
    "availableBalance < amount", "targetWalletId"]), "Stored request, Wallet, or snapshot validation is incomplete.");
expect(all(fxService, ["requireStoredSnapshotEligible",
    "validateStoredSnapshot", "INVALIDATED", "expiresAt"]), "Phase 10E does not remain the stored FX snapshot authority.");
expect(!/lookupOrRefresh|forceRefresh|\.refresh\(|getReferenceRate/.test(service), "Admin decision invokes or refreshes the FX provider.");
expect(!/reserve|applyConditionalDelta|createWallet|Wallet\.create/.test(service), "Admin decision reserves funds or creates/mutates a Wallet.");
expect(all(service, ["terminal", "DECISION_CONFLICT", "decidedBy",
    "decidedAt", "rejectionReason", "findByAuditKey"]), "Exact terminal replay and audit-authority validation are incomplete.");
expect(all(auditAction, ["WALLET_CONVERSION_APPROVED",
    "WALLET_CONVERSION_REJECTED"]) &&
    all(auditModel, ["decision", "rejectionCode", "adminActorId", "decidedAt"]) &&
    all(auditRepository, ["createOnce", "findByAuditKey"]), "Decision audit authority is incomplete.");
expect(all(service, ["withTransaction", "approvePending", "rejectPending",
    "createOnce", "session"]), "Decision and required audit are not transactionally coupled.");
expect(all(routes, ["router.use(protect, authorizeRoles(\"admin\"))",
    "/wallet-conversion-requests", ":conversionReference", "/decision"]), "Admin-only decision/list/detail routes are incomplete.");
expect(all(dto, ["conversionReference", "status", "sourceCurrency",
    "targetCurrency", "sourceAmount", "targetAmount", "fxSnapshotReference",
    "fxProvider", "fxEffectiveDate", "rate", "inverseRate", "requestedAt",
    "decision", "decidedAt", "approvedAt", "rejectedAt", "rejectionCode",
    "rejectionReason"]) &&
    !/userId|WalletId|idempotency|fingerprint|snapshotKey|actor|admin/.test(dto), "Safe User/Admin decision DTO is incomplete or leaks internal identity.");
expect(all(tests, ["ten approvals", "ten identical rejections",
    "approval versus rejection race", "different rejection race",
    "expired approval", "INSUFFICIENT_AVAILABLE_BALANCE", "missing conversion",
    "fingerprint", "missing or mismatched bound snapshot", "source Wallet",
    "bound target Wallet", "partial and internally conflicting",
    "actor and timestamp", "authentication", "role", "strict body",
    "User ownership", "no-money-movement", "collection.indexes",
    "AFTER_GUARDED_TRANSITION", "AFTER_AUDIT", "BEFORE_COMMIT"]), "Phase 10G runtime proof coverage is incomplete.");
expect(testFiles.some((file) => file.endsWith("walletConversionDecisionApproval.test.ts")) &&
    testFiles.some((file) => file.endsWith("walletConversionDecisionRejection.test.ts")) &&
    testFiles.some((file) => file.endsWith("walletConversionDecisionReplay.test.ts")) &&
    testFiles.some((file) => file.endsWith("walletConversionDecisionConcurrency.test.ts")) &&
    testFiles.some((file) => file.endsWith("walletConversionDecisionFailure.test.ts")) &&
    testFiles.some((file) => file.endsWith("walletConversionDecisionIntegrity.test.ts")) &&
    testFiles.some((file) => file.endsWith("walletConversionDecisionRoutes.test.ts")) &&
    testFiles.some((file) => file.endsWith("walletConversionDecisionRegression.test.ts")), "Required Phase 10G runtime files are missing.");
expect(!new RegExp([
    "LedgerEntry", "ledgerService", "WalletProjection", "walletProjectionService",
    "InternalTopUpFunding", "BookingFundReservation", "BookingEscrowAllocation",
    "BookingCreatorSettlement", "CreatorWithdrawal",
    "InternalWithdrawalProvider",
].join("|")).test(production), "Phase 10G touches accounting or another financial domain.");
expect(!new RegExp([
    "InternalProvider", "ProviderExecution", "ConversionExecution",
    "conversionAccounting", "bookingConversion", "serviceCurrency",
    "setInterval", "cron", "scheduler", "worker_threads",
].join("|"), "i").test([service, controller].join("\n")), "Phase 10G implements deferred or unrelated work.");
expect(requestService.includes("createPending") &&
    repository.includes("status: WalletConversionRequestStatus.PENDING"), "Phase 10F is no longer the request-creation authority.");
expect(fxService.includes("validatePersisted") &&
    fxService.includes("snapshotFingerprint"), "Phase 10E is no longer the FX snapshot-integrity authority.");
expect(packageJson.includes('"validate:phase10g"') &&
    packageJson.includes('"test:phase10g"') &&
    packageJson.includes('"test:phase10g:concurrency"') &&
    packageJson.includes('"test:phase10g:integrity"'), "Phase 10G package commands are missing.");
expect(fs_1.default.existsSync(path_1.default.join(workspace, "docs", "implementation", "phase-10g-wallet-conversion-admin-decision.md")), "Phase 10G documentation is missing.");
console.log("Phase 10G Wallet conversion Admin decision validation passed; MongoDB behavior requires test:phase10g.");
