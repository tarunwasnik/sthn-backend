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
    for (const value of values)
        expect(source.includes(value), `${label}: ${value}`);
};
const required = [
    "src/constants/financial/supportedCurrencies.ts",
    "src/services/financial/currencyMetadata.service.ts",
    "src/models/wallet.model.ts",
    "src/repositories/wallet/wallet.repository.ts",
    "src/services/wallet/walletCreation.service.ts",
    "src/services/wallet/walletQuery.service.ts",
    "src/services/financial/walletTopUpRequest.service.ts",
    "src/controllers/wallet.controller.ts",
    "src/routes/v1/wallet.routes.ts",
    "src/tests/financial/phase10c/phase10c.runtime.test.ts",
];
for (const file of required)
    expect(exists(file), `Missing Phase 10C file: ${file}`);
const supported = read(required[0]);
const metadata = read(required[1]);
const wallet = read(required[2]);
const repository = read(required[3]);
const creation = read(required[4]);
const query = read(required[5]);
const topUp = read(required[6]);
const controller = read(required[7]);
const routes = read(required[8]);
const runtime = read(required[9]);
const bookingReservation = read("src/services/financial/bookingWalletReservation.service.ts");
const packageJson = read("package.json");
hasAll(supported, ["INR", "USD", "EUR", "GBP", "JPY", "AUD", "CAD",
    "SGD", "AED", "SupportedCurrency"], "Supported currency authority incomplete");
hasAll(metadata, ["code", "displayName", "symbol", "minorUnits", "enabled",
    "listEnabled", "SUPPORTED_CURRENCIES"], "Currency metadata incomplete");
hasAll(wallet, ["userId", "currency", "immutable: true",
    "walletSchema.index({ userId: 1, currency: 1 }, { unique: true })"], "Wallet ownership authority incomplete");
hasAll(repository, ["findByUserAndCurrency", "findAllByUser",
    "createZeroBalance"], "Wallet repository multi-currency support incomplete");
hasAll(creation, ["currencyMetadataService.normalize", "createWallet",
    "findByUserAndCurrency", "createZeroBalance", "code?: unknown",
    "code === 11000", "return raced"], "Wallet creation replay incomplete");
hasAll(topUp, ["normalizeWalletCurrency", "walletCreationService.createWallet",
    "money.currency", "walletId: wallet._id"], "Top-up currency selection incomplete");
hasAll(query, ["listWallets", "findAllByUser"], "Wallet listing query incomplete");
hasAll(controller, ["listWallets", "toWalletListItemResponseDto",
    "walletQueryService.listWallets"], "Wallet listing controller incomplete");
hasAll(routes, ['router.get(', '"/all"', "walletController.listWallets"], "Wallet listing route incomplete");
hasAll(bookingReservation, ["booking.currency !== currency",
    "walletRepository.findByUserAndCurrency"], "Booking exact-currency requirement is missing");
hasAll(runtime, ["defaultWallet.currency, \"INR\"", "\"USD\"", "\"EUR\"",
    "length: 10", "INTERNAL_TOP_UP_FUNDING", "/api/v1/wallet/all",
    "ownership.unique", "error?.code === 11000"], "Phase 10C runtime proof incomplete");
const phase10cSources = [metadata, creation, query, topUp, controller,
    runtime].join("\n");
for (const forbidden of ["exchangeRate", "fxRate", "convertCurrency",
    "currencyConversion", "providerFx", "bookingConversion"]) {
    expect(!phase10cSources.includes(forbidden), `Deferred FX behavior found: ${forbidden}`);
}
expect(packageJson.includes('"validate:phase10c"') &&
    packageJson.includes('"test:phase10c"'), "Phase 10C scripts are missing.");
expect(node_fs_1.default.existsSync(node_path_1.default.join(workspace, "docs/implementation/phase-10c-multi-currency-wallet-foundation.md")), "Phase 10C documentation is missing.");
console.log("Phase 10C multi-currency Wallet foundation validation passed; MongoDB behavior requires test:phase10c.");
