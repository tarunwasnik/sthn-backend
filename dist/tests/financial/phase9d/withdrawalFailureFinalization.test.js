"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWithdrawalFailureFinalizationTests = void 0;
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
const creatorWithdrawalFinalization_service_1 = require("../../../services/financial/creatorWithdrawalFinalization.service");
const creatorWithdrawalFinalizationFixtures_1 = require("./fixtures/creatorWithdrawalFinalizationFixtures");
const registerWithdrawalFailureFinalizationTests = () => {
    (0, node_test_1.test)("phase9d releases a failed provider reservation exactly once", async () => {
        const server = await (0, creatorWithdrawalFinalizationFixtures_1.startCreatorWithdrawalHttpServer)();
        try {
            const fixture = await (0, creatorWithdrawalFinalizationFixtures_1.createTerminalWithdrawalFixture)(server.baseUrl, withdrawalProviderExecutionOutcome_enum_1.WithdrawalProviderExecutionOutcome.FAILURE);
            const before = await wallet_model_1.Wallet.findById(fixture.creatorWallet._id).orFail();
            const result = await creatorWithdrawalFinalization_service_1.creatorWithdrawalFinalizationService.finalize(fixture.withdrawal.withdrawalReference);
            strict_1.default.equal(result.status, "FAILED");
            strict_1.default.equal(result.outcome, "FAILED");
            const wallet = await wallet_model_1.Wallet.findById(fixture.creatorWallet._id).orFail();
            strict_1.default.equal(wallet.availableBalance, before.availableBalance + fixture.withdrawal.amount);
            strict_1.default.equal(wallet.reservedBalance, before.reservedBalance - fixture.withdrawal.amount);
            strict_1.default.equal(wallet.currentBalance, before.currentBalance);
            const withdrawal = await creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.findOne({
                withdrawalReference: fixture.withdrawal.withdrawalReference,
            }).select("+finalizationTransactionId +providerFailureCode").orFail();
            strict_1.default.equal(withdrawal.status, "FAILED");
            strict_1.default.equal(withdrawal.providerFailureCode, "BANK_NETWORK_FAILURE");
            const entries = await ledgerEntry_model_1.LedgerEntry.find({
                transactionId: withdrawal.finalizationTransactionId,
            });
            strict_1.default.equal(entries.length, 2);
            strict_1.default.ok(entries.some((entry) => entry.direction === moneyDirection_enum_1.MoneyDirection.DEBIT &&
                entry.account === ledgerAccount_enum_1.LedgerAccount.WITHDRAWAL_RESERVED));
            strict_1.default.ok(entries.some((entry) => entry.direction === moneyDirection_enum_1.MoneyDirection.CREDIT &&
                entry.account === ledgerAccount_enum_1.LedgerAccount.WALLET_AVAILABLE));
            strict_1.default.equal(await auditLog_model_1.AuditLog.countDocuments({
                action: auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_FAILED,
            }), 1);
        }
        finally {
            await server.close();
        }
    });
};
exports.registerWithdrawalFailureFinalizationTests = registerWithdrawalFailureFinalizationTests;
