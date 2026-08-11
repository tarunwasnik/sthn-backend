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
    "src/services/financial/marketplacePricing.service.ts",
    "src/models/booking.model.ts",
    "src/services/financial/bookingWalletReservation.service.ts",
    "src/services/financial/bookingWalletReservationRelease.service.ts",
    "src/services/financial/bookingWalletReservationCapture.service.ts",
    "src/services/financial/bookingEscrowAllocation.service.ts",
    "src/services/financial/bookingCreatorSettlement.service.ts",
    "src/tests/financial/phase10b/phase10b.runtime.test.ts",
];
for (const file of required)
    expect(exists(file), `Missing Phase 10B file: ${file}`);
const pricing = read(required[0]);
const booking = read(required[1]);
const reservation = read(required[2]);
const release = read(required[3]);
const capture = read(required[4]);
const allocation = read(required[5]);
const settlement = read(required[6]);
const runtime = read(required[7]);
const accounts = read("src/enums/financial/ledgerAccount.enum.ts");
const paymentPricing = read("src/services/financial/paymentPricing.service.ts");
const packageJson = read("package.json");
hasAll(pricing, ["CUSTOMER_PLATFORM_FEE_RATE_BPS = 500",
    "CREATOR_COMMISSION_RATE_BPS = 2_000", "calculateBps",
    "platformFeeAmount", "commissionAmount", "creatorAmount", "totalAmount",
    "Number.isSafeInteger", "marketplacePricingService"], "Shared pricing authority incomplete");
expect(!pricing.includes("0.05") && !pricing.includes("0.2"), "Pricing authority must use integer basis points only.");
for (const field of ["serviceAmount", "platformFeeAmount", "totalAmount",
    "currency"]) {
    const fieldBody = booking.slice(booking.indexOf(`${field}: {`));
    expect(fieldBody.slice(0, 240).includes("immutable: true"), `Booking pricing field is not immutable: ${field}`);
}
hasAll(paymentPricing, ["marketplacePricingService.calculate",
    "customerFeeAmount: calculated.platformFeeAmount",
    "grossEscrowAmount: calculated.totalAmount"], "Payment pricing incomplete");
hasAll(reservation, ["booking.totalAmount", "LedgerAccount.WALLET_AVAILABLE",
    "LedgerAccount.WALLET_RESERVED", "walletProjectionService"], "Wallet reservation total is incomplete");
hasAll(release, ["booking.totalAmount", "walletProjectionService"], "Wallet release total is incomplete");
hasAll(capture, ["booking.totalAmount", "LedgerAccount.PLATFORM_ESCROW",
    "walletProjectionService"], "Wallet capture total is incomplete");
hasAll(accounts, ["PLATFORM_SERVICE_FEE_REVENUE"], "Platform fee Ledger account missing");
hasAll(allocation, ["marketplacePricingService.validate",
    "PLATFORM_ESCROW", "CREATOR_PAYABLE", "PLATFORM_COMMISSION_PAYABLE",
    "PLATFORM_SERVICE_FEE_REVENUE", "platformFeeCreditPostingKey",
    "allocationLedgerEntryIds.length !== 4", "debitTotal !== creditTotal",
    "serviceAmount: amounts.serviceAmount",
    "platformFeeAmount: amounts.platformFeeAmount",
    "totalAmount: amounts.totalAmount"], "Escrow allocation incomplete");
hasAll(settlement, ["marketplacePricingService.validate",
    "allocation.creatorAmount", "PLATFORM_SERVICE_FEE_REVENUE",
    "settlementLedgerEntryIds.length !== 2"], "Settlement integrity incomplete");
hasAll(runtime, ["customerTopUpAmount: 1_050", "reserved: 1_050",
    "available: 800", "PLATFORM_SERVICE_FEE_REVENUE", "length: 10",
    "snapshotMarketplaceCounts", "withdrawalInput.amount.amount, 800"], "Runtime proof incomplete");
expect(packageJson.includes('"validate:phase10b"') &&
    packageJson.includes('"test:phase10b"'), "Phase 10B scripts are missing.");
expect(node_fs_1.default.existsSync(node_path_1.default.join(workspace, "docs/implementation/phase-10b-customer-platform-fee.md")), "Phase 10B documentation is missing.");
console.log("Phase 10B customer platform fee validation passed; MongoDB behavior requires test:phase10b.");
