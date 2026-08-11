import fs from "fs";
import path from "path";

const src = path.resolve(__dirname, "..");
const backend = path.resolve(src, "..");
const workspace = path.resolve(backend, "..");
const read = (...parts: string[]) =>
  fs.readFileSync(path.join(src, ...parts), "utf8");
const expect = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};
const all = (source: string, values: string[]) =>
  values.every((value) => source.includes(value));

const contract = read("providers", "fx", "fxRateProvider.ts");
const adapter = read("providers", "fx", "configuredReferenceFxRate.provider.ts");
const config = read("constants", "financial", "fxRate.constants.ts");
const decimal = read("utils", "financial", "fxDecimal.util.ts");
const model = read("models", "exchangeRateSnapshot.model.ts");
const auditModel = read("models", "fxRateAudit.model.ts");
const repository = read("repositories", "exchangeRateSnapshot.repository.ts");
const service = read("services", "financial", "fxRateSnapshot.service.ts");
const error = read("errors", "financial", "FxRateSnapshotError.ts");
const dto = read("dtos", "wallet", "fxRateSnapshot.response.dto.ts");
const controller = read("controllers", "fxRateSnapshot.controller.ts");
const adminRoutes = read("routes", "v1", "admin.financial.routes.ts");
const walletRoutes = read("routes", "v1", "wallet.routes.ts");
const packageJson = fs.readFileSync(path.join(backend, "package.json"), "utf8");
const testRoot = path.join(src, "tests", "financial", "phase10e");
const tests = fs.readdirSync(testRoot, { recursive: true })
  .filter((entry): entry is string => typeof entry === "string" && entry.endsWith(".ts"))
  .map((entry) => fs.readFileSync(path.join(testRoot, entry), "utf8"))
  .join("\n");

expect(all(contract, ["FxRateProvider", "getReferenceRate", "baseCurrency",
  "quoteCurrency", "effectiveDate", "rawResponseFingerprint"]),
"FX provider contract is missing.");
expect(all(adapter, ["ConfiguredReferenceFxRateProvider", "AbortController",
  "setTimeout", "response.text", "FX_RATE_PROVIDER_TIMEOUT"]),
"Configured bounded provider adapter is missing.");
expect(all(config, ["FX_RATE_PROVIDER_NAME", "FX_RATE_PROVIDER_BASE_URL",
  "FX_RATE_PROVIDER_API_KEY", "FX_RATE_PROVIDER_TIMEOUT_MS",
  "FX_RATE_MAX_AGE_MS", "FX_RATE_SNAPSHOT_VALIDITY_MS",
  "FX_RATE_PROVIDER_REQUEST_ENABLED"]), "Environment FX configuration is incomplete.");
expect(!adapter.includes("apiKey:") && !/sk-[A-Za-z0-9]/.test(adapter),
  "Provider adapter contains a committed secret.");
expect(service.indexOf("provider.getReferenceRate") < service.indexOf("this.persist"),
  "Provider call is not clearly outside the snapshot transaction.");
expect(all(decimal, ["BigInt", "rate.scale", "deriveInverseRate",
  "FX_RATE_MAX_DECIMAL_SCALE"]) && !decimal.includes("parseFloat"),
"Rate authority is not deterministic scaled-integer arithmetic.");
expect(all(model, ["ExchangeRateSnapshot", "snapshotReference", "snapshotKey",
  "provider", "baseCurrency", "quoteCurrency", "rateValue", "rateScale",
  "inverseRateValue", "inverseRateScale", "effectiveDate", "fetchedAt",
  "validFrom", "expiresAt", "responseFingerprint", "snapshotFingerprint",
  "immutable: true"]), "Immutable snapshot model is incomplete.");
expect(model.includes("partialFilterExpression") &&
  model.includes("unique_active_fx_pair_provider"),
"Current ACTIVE snapshot authority is missing.");
expect(all(repository, ["findByReference", "findByKey", "findCurrentPair",
  "findLatestValidPair", "supersedeActive", "list"]) &&
  !/delete|genericUpdate|setStatus/.test(repository),
"Snapshot repository is not narrow and append-preserving.");
expect(all(service, ["currencyMetadataService.normalize", "enabledPairs",
  "baseCurrency === quoteCurrency", "FX_RATE_PAIR_NOT_SUPPORTED"]),
"Supported directed-pair policy is missing.");
expect(all(service, ["effectiveDate", "providerPublishedAt", "fetchedAt",
  "maxAgeMs", "snapshotValidityMs", "FX_RATE_STALE_PROVIDER_RESPONSE"]),
"Effective-date freshness policy is missing.");
expect(all(service, ["deriveInverseRate", "scaledRatesWithinOneUnit",
  "immutableFingerprint", "snapshotKey", "snapshotFingerprint"]),
"Inverse validation or deterministic snapshot identity is missing.");
expect(all(service, ["if (!force && current && this.isFresh",
  "SNAPSHOT_REUSED", "SNAPSHOT_SUPERSEDED", "cachedFallback"]),
"Lookup, forced refresh, replay, supersession, or fallback is missing.");
expect(all(error, ["FX_RATE_PROVIDER_NOT_CONFIGURED", "FX_RATE_PROVIDER_TIMEOUT",
  "FX_RATE_INVALID_RATE", "FX_RATE_SNAPSHOT_EXPIRED",
  "FX_RATE_CURRENT_AUTHORITY_CONFLICT", "statusCode"]),
"Typed FX errors are incomplete.");
expect(all(controller, ["baseCurrency", "quoteCurrency", "force",
  "Object.keys", "ADMIN"]) && !all(controller, ["body.rate", "body.inverseRate"]),
"Admin refresh accepts provider authority fields.");
expect(adminRoutes.includes("/fx-rates/refresh") &&
  walletRoutes.includes("/fx-rates/:baseCurrency/:quoteCurrency"),
"Admin refresh or safe read route is missing.");
expect(all(dto, ["snapshotReference", "rate", "inverseRate", "effectiveDate",
  "isCurrent", "isStale", "baseMinorUnits", "quoteMinorUnits"]) &&
  !/snapshotKey|responseFingerprint|snapshotFingerprint|apiKey|createdBy/.test(dto),
"Safe FX DTO is incomplete or leaks internal authority.");
expect(all(auditModel, ["FxRateAudit", "auditKey", "snapshotReference",
  "previousSnapshotReference", "failureCode", "actorType"]),
"Safe FX audit authority is missing.");
expect(all(service, ["SNAPSHOT_CREATED", "SNAPSHOT_REUSED",
  "SNAPSHOT_SUPERSEDED", "REFRESH_FAILED"]),
"Required FX audit actions are not persisted.");
expect(all(tests, ["Promise.allSettled", "ten normal empty-cache",
  "ten identical forced", "old/new effective-date race"]),
"FX concurrency proof is missing.");
expect(all(tests, ["AFTER_PROVIDER_VALIDATION", "AFTER_SNAPSHOT_CREATION",
  "BEFORE_AUDIT", "BEFORE_COMMIT", "AFTER_SUPERSESSION"]),
"FX rollback proof is missing.");
expect(all(tests, ["unsupported", "identical", "zero", "negative",
  "malformed", "excessive scale", "future",
  "stale", "wrong-pair", "inverse-mismatch", "corrupted immutable fingerprint"]),
"FX integrity proof is missing.");
expect(all(tests, ["Admin refresh authorization", "unauthenticated",
  "only snapshots and safe FX audits", "collection.indexes"]),
"Authorization, no-money-movement, or index tests are missing.");
const production = [service, model, repository, controller, adapter].join("\n");
expect(!/walletProjectionService|ledgerService|Wallet\.find|WalletTopUpRequest|Booking|Settlement|Withdrawal/.test(production),
"Phase 10E mutates or imports a frozen money domain.");
expect(!/ConversionRequest|convertWallet|currencyConversion/.test(production),
"Phase 10E implements conversion.");
expect(!/setInterval|cron|scheduler|worker_threads/.test(production),
"Phase 10E adds a worker or scheduler.");
expect(packageJson.includes('"validate:phase10e"') &&
  packageJson.includes('"test:phase10e"'), "Phase 10E commands are missing.");
expect(fs.existsSync(path.join(workspace, "docs", "implementation",
  "phase-10e-daily-fx-rate-snapshots.md")), "Phase 10E documentation is missing.");

console.log("Phase 10E daily FX snapshot validation passed; MongoDB behavior requires test:phase10e.");
