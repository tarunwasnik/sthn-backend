"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerMarketplaceFinancialIntegrityTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const internalProvider_1 = require("../../../constants/internalProvider");
const auditAction_enum_1 = require("../../../enums/financial/auditAction.enum");
const ledgerAccount_enum_1 = require("../../../enums/financial/ledgerAccount.enum");
const ledgerSource_enum_1 = require("../../../enums/financial/ledgerSource.enum");
const moneyDirection_enum_1 = require("../../../enums/financial/moneyDirection.enum");
const auditLog_model_1 = require("../../../models/auditLog.model");
const internalProviderEvent_model_1 = __importDefault(require("../../../models/internalProvider/internalProviderEvent.model"));
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const marketplaceFixtures_1 = require("./fixtures/marketplaceFixtures");
const balance = (entries, account) => entries.filter((entry) => entry.account === account)
    .reduce((sum, entry) => sum + (entry.direction === moneyDirection_enum_1.MoneyDirection.CREDIT
    ? entry.amount : -entry.amount), 0);
const registerMarketplaceFinancialIntegrityTests = () => {
    (0, node_test_1.test)("phase10a Ledger, projections, liabilities, and audits reconcile", async () => {
        const flow = await (0, marketplaceFixtures_1.createSuccessfulMarketplaceFlow)();
        try {
            const entries = await ledgerEntry_model_1.LedgerEntry.find().select("+postingKey");
            strict_1.default.equal(entries.length, 15);
            const postingKeys = entries.map((entry) => entry.postingKey)
                .filter((value) => !!value);
            strict_1.default.equal(new Set(postingKeys).size, postingKeys.length);
            const byTransaction = new Map();
            for (const entry of entries) {
                byTransaction.set(entry.transactionId, [...(byTransaction.get(entry.transactionId) ?? []), entry]);
            }
            for (const transactionEntries of byTransaction.values()) {
                if (transactionEntries.every((entry) => entry.source === ledgerSource_enum_1.LedgerSource.INTERNAL_TOP_UP_FUNDING)) {
                    strict_1.default.equal(transactionEntries.length, 1);
                    strict_1.default.equal(transactionEntries[0].direction, moneyDirection_enum_1.MoneyDirection.CREDIT);
                    strict_1.default.equal(transactionEntries[0].amount, 2000);
                    continue;
                }
                const debits = transactionEntries.filter((entry) => entry.direction === moneyDirection_enum_1.MoneyDirection.DEBIT)
                    .reduce((sum, entry) => sum + entry.amount, 0);
                const credits = transactionEntries.filter((entry) => entry.direction === moneyDirection_enum_1.MoneyDirection.CREDIT)
                    .reduce((sum, entry) => sum + entry.amount, 0);
                strict_1.default.equal(debits, credits);
            }
            const sourceCounts = new Map();
            for (const entry of entries)
                sourceCounts.set(entry.source, (sourceCounts.get(entry.source) ?? 0) + 1);
            strict_1.default.deepEqual(Object.fromEntries(sourceCounts), {
                INTERNAL_TOP_UP_FUNDING: 1,
                BOOKING_WALLET_AUTHORIZATION: 2,
                BOOKING_WALLET_CAPTURE: 2,
                BOOKING_ESCROW_ALLOCATION: 4,
                BOOKING_CREATOR_WALLET_SETTLEMENT: 2,
                CREATOR_WITHDRAWAL_RESERVATION: 2,
                WITHDRAWAL_PROVIDER_FINALIZATION: 2,
            });
            strict_1.default.ok(entries.every((entry) => !!entry.bookingId ||
                typeof entry.metadata?.topUpReference === "string" ||
                typeof entry.metadata?.withdrawalReference === "string"));
            strict_1.default.equal(balance(entries, ledgerAccount_enum_1.LedgerAccount.PLATFORM_ESCROW), 0);
            strict_1.default.equal(balance(entries, ledgerAccount_enum_1.LedgerAccount.PLATFORM_COMMISSION_PAYABLE), 200);
            strict_1.default.equal(balance(entries, ledgerAccount_enum_1.LedgerAccount.PLATFORM_SERVICE_FEE_REVENUE), 50);
            strict_1.default.equal(balance(entries, ledgerAccount_enum_1.LedgerAccount.CREATOR_PAYABLE), 0);
            strict_1.default.equal(balance(entries, ledgerAccount_enum_1.LedgerAccount.WITHDRAWAL_RESERVED), 0);
            strict_1.default.equal(balance(entries, ledgerAccount_enum_1.LedgerAccount.PAYOUT_CLEARING), 800);
            const projections = await walletProjectionOperation_model_1.WalletProjectionOperation.find();
            strict_1.default.equal(projections.length, 6);
            const ledgerIds = new Set(entries.map((entry) => entry._id.toString()));
            strict_1.default.ok(projections.every((operation) => operation.ledgerEntryIds.length > 0 &&
                operation.ledgerEntryIds.every((id) => ledgerIds.has(id.toString()))));
            for (const [walletId, expected] of [
                [flow.actors.wallet._id.toString(), [950, 0, 0, 950]],
                [flow.creatorWallet._id.toString(), [0, 0, 0, 0]],
            ]) {
                const owned = projections.filter((item) => item.walletId.toString() === walletId);
                const sums = owned.reduce((state, item) => [
                    state[0] + item.deltas.availableBalance,
                    state[1] + item.deltas.reservedBalance,
                    state[2] + item.deltas.lockedBalance,
                ], [0, 0, 0]);
                const wallet = await wallet_model_1.Wallet.findById(walletId).orFail();
                strict_1.default.deepEqual([...sums, sums[0] + sums[1] + sums[2]], expected);
                strict_1.default.deepEqual([wallet.availableBalance, wallet.reservedBalance,
                    wallet.lockedBalance, wallet.currentBalance], expected);
            }
            const auditActions = [
                auditAction_enum_1.AuditAction.BOOKING_WALLET_RESERVATION_CAPTURED,
                auditAction_enum_1.AuditAction.BOOKING_ESCROW_ALLOCATED,
                auditAction_enum_1.AuditAction.BOOKING_CREATOR_WALLET_SETTLED,
                auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_REQUESTED,
                auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_PROVIDER_INITIALIZED,
                auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_PROVIDER_PROCESSING,
                auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_PROVIDER_SUCCEEDED,
                auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_COMPLETED,
                auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_RECONCILIATION_CREATED,
            ];
            for (const action of auditActions)
                strict_1.default.equal(await auditLog_model_1.AuditLog.countDocuments({ action }), 1);
            for (const eventType of [
                internalProvider_1.ProviderEventType.WITHDRAWAL_PROVIDER_CREATED,
                internalProvider_1.ProviderEventType.WITHDRAWAL_PROVIDER_INITIALIZED,
                internalProvider_1.ProviderEventType.WITHDRAWAL_PROVIDER_PROCESSING,
                internalProvider_1.ProviderEventType.WITHDRAWAL_PROVIDER_SUCCEEDED,
            ])
                strict_1.default.equal(await internalProviderEvent_model_1.default.countDocuments({
                    eventType,
                }), 1);
        }
        finally {
            await flow.server.close();
        }
    });
};
exports.registerMarketplaceFinancialIntegrityTests = registerMarketplaceFinancialIntegrityTests;
