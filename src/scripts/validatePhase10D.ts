import fs from "fs";
import path from "path";

const srcRoot = path.resolve(__dirname, "..");
const backendRoot = path.resolve(srcRoot, "..");
const workspaceRoot = path.resolve(backendRoot, "..");
const read = (...parts: string[]) =>
  fs.readFileSync(path.join(srcRoot, ...parts), "utf8");
const expect = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};
const containsAll = (source: string, values: string[]) =>
  values.every((value) => source.includes(value));

const metadata = read("services", "financial", "currencyMetadata.service.ts");
const currencies = read("constants", "financial", "supportedCurrencies.ts");
const walletModel = read("models", "wallet.model.ts");
const walletCreation = read("services", "wallet", "walletCreation.service.ts");
const walletQuery = read("services", "wallet", "walletQuery.service.ts");
const requestModel = read("models", "walletTopUpRequest.model.ts");
const requestService = read("services", "financial", "walletTopUpRequest.service.ts");
const adminDecision = read("services", "financial", "adminWalletTopUpDecision.service.ts");
const fundingModel = read("models", "internalTopUpFunding.model.ts");
const fundingOrchestrator = read("services", "financial", "topUpFundingOrchestrator.service.ts");
const accounting = read("services", "financial", "topUpAccountingOrchestrator.service.ts");
const projection = read("services", "wallet", "walletProjection.service.ts");
const walletDto = read("dtos", "wallet", "getWallet.response.dto.ts");
const currencyDto = read("dtos", "wallet", "currencyMetadata.response.dto.ts");
const walletController = read("controllers", "wallet.controller.ts");
const walletRoutes = read("routes", "v1", "wallet.routes.ts");
const packageJson = fs.readFileSync(path.join(backendRoot, "package.json"), "utf8");

const testDirectory = path.join(srcRoot, "tests", "financial", "phase10d");
const testSources = fs.readdirSync(testDirectory, { recursive: true })
  .filter((entry): entry is string => typeof entry === "string" && entry.endsWith(".ts"))
  .map((entry) => fs.readFileSync(path.join(testDirectory, entry), "utf8"))
  .join("\n");

expect(containsAll(metadata, ["CurrencyMetadataService", "SUPPORTED_CURRENCIES",
  "minorUnits", "enabled"]), "Central currency metadata authority is missing.");
expect(currencies.includes("SUPPORTED_CURRENCIES") &&
  !requestService.includes("const SUPPORTED_CURRENCIES"),
"Top-up introduced a duplicate supported-currency authority.");
expect(walletModel.includes("walletSchema.index({ userId: 1, currency: 1 }, { unique: true })"),
  "Wallet ownership uniqueness is missing.");
expect(containsAll(walletCreation, ["currencyMetadataService.normalize",
  "findByUserAndCurrency", "createZeroBalance", "code === 11000"]),
"Wallet creation is not supported-currency-bound and idempotent.");
expect(containsAll(requestService, ["walletCreationService.createWallet",
  "existing.amount !== money.amount", "existing.currency !== money.currency",
  "existingWallet._id.equals(existing.walletId)", "isValidMoney"]),
"Selected-currency Wallet resolution or replay binding is missing.");
expect(containsAll(requestModel, ["walletId", "currency", "amount",
  "idempotencyKey", "requestFingerprint", "immutable: true"]),
"Immutable top-up request identity is incomplete.");
expect(containsAll(fundingModel, ["topUpRequestId", "amount", "currency",
  "idempotencyKey", "requestFingerprint"]),
"Provider funding identity is incomplete.");
expect(containsAll(fundingOrchestrator, ["linked.amount !== request.amount",
  "linked.currency !== request.currency", "currency: request.currency"]),
"Provider replay is not request-currency-bound.");
expect(containsAll(accounting, ["funding.currency !== request.currency",
  "ledger.currency !== request.currency", "operation.currency !== request.currency",
  "operation.walletId.equals(request.walletId)",
  "wallet.currency !== request.currency", "LedgerEntryType.WALLET_TOP_UP",
  "LedgerSource.INTERNAL_TOP_UP_FUNDING", "walletProjectionService"]),
"Ledger or projection accounting is not bound to the selected currency Wallet.");
expect(containsAll(projection, ["normalizeWalletCurrency", "findByUserAndCurrency",
  "applyConditionalDelta", "operationKey", "fingerprint"]),
"Wallet projection currency isolation or replay authority is missing.");
expect(!adminDecision.includes("exchangeRate") &&
  !containsAll(adminDecision, ["input.currency", "input.amount", "input.walletId"]),
"Admin decision can alter immutable top-up intent.");
expect(containsAll(walletQuery, ["findAllByUser", "listWallets"]) &&
  containsAll(walletRoutes, ["/all", "listWallets", "/currencies", "listCurrencies"]),
"Authenticated Wallet or currency listing is missing.");
expect(containsAll(walletController, ["req.user", "listWallets",
  "currencyMetadataService.listEnabled"]),
"Wallet listing is not authenticated or metadata-backed.");
expect(containsAll(walletDto, ["currency", "available", "reserved", "locked",
  "current", "createdAt"]) &&
  !walletDto.slice(walletDto.indexOf("WalletListItemResponseDto"))
    .includes("requestFingerprint"),
"Wallet list DTO is unsafe or incomplete.");
expect(containsAll(currencyDto, ["code", "displayName", "symbol", "minorUnits",
  "walletEnabled", "topUpEnabled"]) &&
  !/exchangeRate|providerConfig|spread/i.test(currencyDto),
"Currency metadata DTO is unsafe or includes FX data.");
expect(containsAll(testSources, ["Promise.allSettled", "ten USD Wallet",
  "identical USD accounting", "INR, USD, and EUR", "no lost update"]),
"Required genuine concurrency tests are missing.");
expect(containsAll(testSources, ["preserve the funded currency end to end",
  "provider currency", "Ledger currency", "projection currency corruption",
  "completed USD request cannot link to EUR projection"]),
"Cross-currency full-flow and integrity tests are missing.");
expect(containsAll(testSources, ["rejected USD request", "failed EUR funding",
  "zero credit"]), "Rejection or provider-failure proof is missing.");
expect(containsAll(testSources, ["request persistence failure",
  "provider event failure", "Ledger-only interruption",
  "aborted EUR projection", "completion-link interruption"]),
"Staged rollback and recovery tests are missing.");
expect(containsAll(testSources, ["JPY zero-decimal", "MAX_TRANSACTION_AMOUNT",
  "fractional", "unsupported"]), "Minor-unit boundary tests are missing.");
expect(containsAll(testSources, ["Creator role reuses", "only owned Wallets",
  "stable order"]), "User/Creator Wallet listing proof is missing.");
expect(containsAll(testSources, ["service reload", "cross-currency key",
  "provider", "accounting"]), "Currency-bound replay proof is missing.");
expect(testSources.includes("collection.indexes()") &&
  testSources.includes("index.key.currency === 1"),
"MongoDB identity index verification is missing.");
expect(packageJson.includes('"validate:phase10d"') &&
  packageJson.includes('"test:phase10d"'), "Phase 10D package commands are missing.");
expect(fs.existsSync(path.join(workspaceRoot, "docs", "implementation",
  "phase-10d-direct-multi-currency-top-up.md")),
"Phase 10D documentation is missing.");

const productionScope = [requestService, fundingOrchestrator, accounting,
  projection, walletController, currencyDto].join("\n");
expect(!/exchange.?rate|fx.?rate|currency.?conversion|conversion.?request/i
  .test(productionScope), "Phase 10D contains FX or conversion implementation.");
expect(!/external.?provider/i.test(productionScope),
  "Phase 10D contains external provider integration.");
expect(!/booking|settlement|withdrawal/i.test(
  [requestService, fundingOrchestrator, accounting, projection].join("\n")),
"Direct top-up services crossed a frozen financial boundary.");

console.log("Phase 10D direct multi-currency top-up validation passed; MongoDB behavior requires test:phase10d.");
