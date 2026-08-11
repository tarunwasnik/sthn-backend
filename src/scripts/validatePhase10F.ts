import fs from "fs";
import path from "path";

const src = path.resolve(__dirname, "..");
const backend = path.resolve(src, "..");
const workspace = path.resolve(backend, "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(src, ...parts),
  "utf8");
const expect = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};
const all = (source: string, values: string[]) =>
  values.every((value) => source.includes(value));

const model = read("models", "walletConversionRequest.model.ts");
const audit = read("models", "walletConversionAudit.model.ts");
const auditAction = read("enums", "financial",
  "walletConversionAuditAction.enum.ts");
const status = read("enums", "financial",
  "walletConversionRequestStatus.enum.ts");
const repository = read("repositories",
  "walletConversionRequest.repository.ts");
const quote = read("services", "financial",
  "walletConversionQuote.service.ts");
const service = read("services", "financial",
  "walletConversionRequest.service.ts");
const fxService = read("services", "financial", "fxRateSnapshot.service.ts");
const controller = read("controllers", "walletConversionRequest.controller.ts");
const routes = read("routes", "v1", "wallet.routes.ts");
const dto = read("dtos", "wallet",
  "walletConversionRequest.response.dto.ts");
const packageJson = fs.readFileSync(path.join(backend, "package.json"), "utf8");
const testRoot = path.join(src, "tests", "financial", "phase10f");
const tests = fs.readdirSync(testRoot, { recursive: true })
  .filter((entry): entry is string => typeof entry === "string" &&
    entry.endsWith(".ts"))
  .map((entry) => fs.readFileSync(path.join(testRoot, entry), "utf8"))
  .join("\n");

expect(all(model, ["WalletConversionRequest", "conversionReference",
  "conversionKey", "userId", "sourceWalletId", "targetWalletId",
  "sourceCurrency", "targetCurrency", "sourceAmount", "targetAmount",
  "fxSnapshotId", "fxSnapshotReference", "requestFingerprint",
  "immutable: true"]), "Wallet conversion request authority is incomplete.");
expect(status.includes('PENDING = "PENDING"') &&
  status.includes('APPROVED = "APPROVED"') &&
  status.includes('REJECTED = "REJECTED"') &&
  !/PROCESSING|CANCELLED/.test(status),
"Conversion request foundation contains an invalid intermediate state.");
expect(all(repository, ["createPending", "findByReference",
  "findByUserAndIdempotencyKey", "listByUser", "findPendingByUser"]) &&
  !/genericUpdate|updateStatus|delete|setStatus/.test(repository),
"Request repository does not preserve the narrow Phase 10F creation contract.");
expect(all(controller, ["req.user.id", "Idempotency-Key", "Object.keys",
  "sourceCurrency", "targetCurrency", "sourceAmount"]) &&
  !/req.body.userId|req.body.wallet|req.body.snapshot|req.body.rate/.test(controller),
"Authenticated ownership or strict request-body authority is missing.");
expect(all(service, ["findByUserAndIdempotencyKey", "findByUserAndCurrency",
  "validateWallet", "availableBalance < amount", "targetWallet?._id"]),
"Source validation or optional target-Wallet binding is missing.");
expect(all(quote, ["currencyMetadataService", "sourceCurrency === targetCurrency",
  "minorUnits", "BigInt", "denominator / 2n", "TARGET_AMOUNT_ZERO"]) &&
  !/parseFloat|Math\.round|Number\(.*rate/.test(quote),
"Safe minor-unit target calculation is missing.");
expect(all(service, ["requireCurrentSnapshot", "validateStoredSnapshot",
  "fxSnapshotReference", "fxProvider", "fxEffectiveDate", "rateValue",
  "inverseRateValue"]), "Immutable Phase 10E snapshot binding is missing.");
expect(all(fxService, ["requireCurrentSnapshot", "validateStoredSnapshot",
  "validatePersisted", "isFresh"]), "Phase 10E is not the snapshot authority.");
expect(!/getReferenceRate|lookupOrRefresh|\.refresh\(/.test(service),
  "Phase 10F calls or refreshes an FX provider.");
expect(all(service, ["isValidIdempotencyKey", "requestFingerprint",
  "conversionKey", "IDEMPOTENCY_CONFLICT", "fxSnapshotReference"]),
"Idempotency and snapshot-stable replay are incomplete.");
expect(all(routes, ["/conversion-requests", ":conversionReference", "protect"]),
  "Authenticated conversion routes are missing.");
expect(all(dto, ["conversionReference", "status", "sourceCurrency",
  "targetCurrency", "sourceAmount", "targetAmount", "fxSnapshotReference",
  "rate", "inverseRate", "requestedAt"]) &&
  !/userId|WalletId|idempotency|fingerprint|snapshotKey|actor|admin/.test(dto),
"Safe request DTO is incomplete or leaks internal authority.");
expect(auditAction.includes("WALLET_CONVERSION_REQUEST_CREATED") &&
  all(audit, ["auditKey", "conversionReference", "fxSnapshotReference",
    "requestedAt"]),
"Safe request audit is missing.");
expect(all(tests, ["Promise.allSettled", "ten identical", "conflicting idempotency",
  "AFTER_SOURCE_WALLET_VALIDATION", "AFTER_REQUEST_CREATION", "BEFORE_COMMIT",
  "unsupported", "insufficient", "expired", "invalidated", "corrupted",
  "Creator reuse", "ownership-scoped", "collection.indexes",
  "no-money-movement"]), "Required Phase 10F runtime proofs are incomplete.");
const production = [model, repository, quote, service, controller, dto].join("\n");
expect(!/LedgerEntry|ledgerService|WalletProjection|walletProjectionService/.test(
  production), "Phase 10F implements accounting.");
expect(!/createWallet|applyConditionalDelta|applyProjectionMutation/.test(production),
  "Phase 10F mutates or auto-creates a Wallet.");
expect(!/AdminDecision|approvePending|rejectPending|approvedAt|rejectedAt/.test(
  [quote, service, controller].join("\n")),
"Phase 10F request creation implements Admin decision authority.");
expect(!/InternalProvider|ProviderExecution|ConversionExecution/.test(
  [quote, service, controller].join("\n")),
"Phase 10F request creation implements provider execution.");
expect(!/bookingConversion|serviceCurrency|setInterval|cron|scheduler|worker_threads/i
  .test(production), "Phase 10F contains deferred or unrelated behavior.");
expect(packageJson.includes('"validate:phase10f"') &&
  packageJson.includes('"test:phase10f"'), "Phase 10F commands are missing.");
expect(fs.existsSync(path.join(workspace, "docs", "implementation",
  "phase-10f-wallet-conversion-request-foundation.md")),
"Phase 10F documentation is missing.");

console.log("Phase 10F Wallet conversion request validation passed; MongoDB behavior requires test:phase10f.");
