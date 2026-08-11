"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWithdrawalCompletionTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const auditAction_enum_1 = require("../../../enums/financial/auditAction.enum");
const ledgerAccount_enum_1 = require("../../../enums/financial/ledgerAccount.enum");
const moneyDirection_enum_1 = require("../../../enums/financial/moneyDirection.enum");
const withdrawalProviderExecutionOutcome_enum_1 = require("../../../enums/financial/withdrawalProviderExecutionOutcome.enum");
const auditLog_model_1 = require("../../../models/auditLog.model");
const creatorWithdrawalRequest_model_1 = require("../../../models/creatorWithdrawalRequest.model");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const creatorWithdrawalFinalization_service_1 = require("../../../services/financial/creatorWithdrawalFinalization.service");
const creatorWithdrawalFinalizationFixtures_1 = require("./fixtures/creatorWithdrawalFinalizationFixtures");
const registerWithdrawalCompletionTests = () => {
    (0, node_test_1.test)("phase9d consumes a successful provider reservation exactly once", async () => {
        const server = await (0, creatorWithdrawalFinalizationFixtures_1.startCreatorWithdrawalHttpServer)();
        try {
            const fixture = await (0, creatorWithdrawalFinalizationFixtures_1.createTerminalWithdrawalFixture)(server.baseUrl, withdrawalProviderExecutionOutcome_enum_1.WithdrawalProviderExecutionOutcome.SUCCESS);
            const before = await wallet_model_1.Wallet.findById(fixture.creatorWallet._id).orFail();
            const result = await creatorWithdrawalFinalization_service_1.creatorWithdrawalFinalizationService.finalize(fixture.withdrawal.withdrawalReference);
            strict_1.default.equal(result.status, "COMPLETED");
            strict_1.default.equal(result.outcome, "COMPLETED");
            strict_1.default.equal(result.replay, false);
            const wallet = await wallet_model_1.Wallet.findById(fixture.creatorWallet._id).orFail();
            strict_1.default.equal(wallet.availableBalance, before.availableBalance);
            strict_1.default.equal(wallet.reservedBalance, before.reservedBalance - fixture.withdrawal.amount);
            strict_1.default.equal(wallet.currentBalance, before.currentBalance - fixture.withdrawal.amount);
            const withdrawal = await creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.findOne({
                withdrawalReference: fixture.withdrawal.withdrawalReference,
            }).select("+finalizationLedgerEntryIds +finalizationTransactionId " +
                "+finalizationProjectionOperationReference")
                .orFail();
            strict_1.default.equal(withdrawal.status, "COMPLETED");
            strict_1.default.equal(withdrawal.reservedAmount, 0);
            strict_1.default.ok(withdrawal.completedAt);
            const entries = await ledgerEntry_model_1.LedgerEntry.find({
                transactionId: withdrawal.finalizationTransactionId,
            });
            strict_1.default.equal(entries.length, 2);
            strict_1.default.ok(entries.some((entry) => entry.direction === moneyDirection_enum_1.MoneyDirection.DEBIT &&
                entry.account === ledgerAccount_enum_1.LedgerAccount.WITHDRAWAL_RESERVED));
            strict_1.default.ok(entries.some((entry) => entry.direction === moneyDirection_enum_1.MoneyDirection.CREDIT &&
                entry.account === ledgerAccount_enum_1.LedgerAccount.PAYOUT_CLEARING && !entry.walletId));
            const projection = await walletProjectionOperation_model_1.WalletProjectionOperation.findOne({
                operationReference: withdrawal.finalizationProjectionOperationReference,
            }).orFail();
            strict_1.default.equal(projection.deltas.availableBalance, 0);
            strict_1.default.equal(projection.deltas.reservedBalance, -fixture.withdrawal.amount);
            strict_1.default.equal(projection.deltas.lockedBalance, 0);
            strict_1.default.equal(await auditLog_model_1.AuditLog.countDocuments({
                action: auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_COMPLETED,
            }), 1);
        }
        finally {
            await server.close();
        }
    });
};
exports.registerWithdrawalCompletionTests = registerWithdrawalCompletionTests;
