"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const ledgerAccount_enum_1 = require("../../enums/financial/ledgerAccount.enum");
const ledgerEntryType_enum_1 = require("../../enums/financial/ledgerEntryType.enum");
const ledgerSource_enum_1 = require("../../enums/financial/ledgerSource.enum");
const moneyDirection_enum_1 = require("../../enums/financial/moneyDirection.enum");
const ledgerEntry_model_1 = require("../../models/ledgerEntry.model");
const platformRevenue_service_1 = require("../../services/financial/platformRevenue.service");
const database_1 = require("./phase7h/helpers/database");
(0, node_test_1.before)(async () => { process.env.NODE_ENV = "test"; await (0, database_1.connectPhase7HDatabase)(); });
(0, node_test_1.after)(async () => { await (0, database_1.disconnectPhase7HDatabase)(); });
(0, node_test_1.test)("platform revenue counts only recognized Ledger revenue by currency", async () => { await (0, database_1.clearPhase7HDatabase)(); const rows = [[ledgerAccount_enum_1.LedgerAccount.PLATFORM_SERVICE_FEE_REVENUE, moneyDirection_enum_1.MoneyDirection.CREDIT, 5000, "USD"], [ledgerAccount_enum_1.LedgerAccount.PLATFORM_CREATOR_COMMISSION_REVENUE, moneyDirection_enum_1.MoneyDirection.CREDIT, 20000, "USD"], [ledgerAccount_enum_1.LedgerAccount.PLATFORM_SERVICE_FEE_REVENUE, moneyDirection_enum_1.MoneyDirection.CREDIT, 1000, "INR"], [ledgerAccount_enum_1.LedgerAccount.PLATFORM_ESCROW, moneyDirection_enum_1.MoneyDirection.CREDIT, 105000, "USD"], [ledgerAccount_enum_1.LedgerAccount.CREATOR_PAYABLE, moneyDirection_enum_1.MoneyDirection.CREDIT, 80000, "USD"], [ledgerAccount_enum_1.LedgerAccount.WALLET_AVAILABLE, moneyDirection_enum_1.MoneyDirection.CREDIT, 80000, "USD"], [ledgerAccount_enum_1.LedgerAccount.PLATFORM_COMMISSION_PAYABLE, moneyDirection_enum_1.MoneyDirection.CREDIT, 20000, "USD"]]; for (const [account, direction, amount, currency] of rows)
    await ledgerEntry_model_1.LedgerEntry.create({ ledgerReference: `rev-${account}-${currency}`, transactionId: `t-${account}-${currency}`, type: ledgerEntryType_enum_1.LedgerEntryType.BOOKING_ESCROW_ALLOCATED, source: ledgerSource_enum_1.LedgerSource.BOOKING_ESCROW_ALLOCATION, account, direction, amount, currency }); const summary = await platformRevenue_service_1.platformRevenueService.summary(); strict_1.default.deepEqual(summary.currencies, [{ currency: "INR", customerPlatformFeeRevenue: 1000, creatorCommissionRevenue: 0, totalPlatformRevenue: 1000 }, { currency: "USD", customerPlatformFeeRevenue: 5000, creatorCommissionRevenue: 20000, totalPlatformRevenue: 25000 }]); const entries = await platformRevenue_service_1.platformRevenueService.entries({}); strict_1.default.equal(entries.items.length, 3); for (const x of entries.items) {
    strict_1.default.ok(Object.keys(x).every(key => ["bookingReference", "paymentReference", "category", "currency", "amount", "recognizedAt"].includes(key)));
    if (x.bookingReference !== undefined)
        strict_1.default.equal(typeof x.bookingReference, "string");
    if (x.paymentReference !== undefined)
        strict_1.default.equal(typeof x.paymentReference, "string");
} });
