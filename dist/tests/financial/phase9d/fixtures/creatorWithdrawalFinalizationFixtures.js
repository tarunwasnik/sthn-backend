"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.snapshotPhase9DFinancialState = exports.createTerminalWithdrawalFixture = exports.startCreatorWithdrawalHttpServer = void 0;
const auditAction_enum_1 = require("../../../../enums/financial/auditAction.enum");
const withdrawalProviderExecutionOutcome_enum_1 = require("../../../../enums/financial/withdrawalProviderExecutionOutcome.enum");
const auditLog_model_1 = require("../../../../models/auditLog.model");
const ledgerEntry_model_1 = require("../../../../models/ledgerEntry.model");
const wallet_model_1 = require("../../../../models/wallet.model");
const walletProjectionOperation_model_1 = require("../../../../models/walletProjectionOperation.model");
const withdrawalProviderExecution_service_1 = require("../../../../services/financial/withdrawalProviderExecution.service");
const withdrawalProviderExecutionFixtures_1 = require("../../phase9c/fixtures/withdrawalProviderExecutionFixtures");
Object.defineProperty(exports, "startCreatorWithdrawalHttpServer", { enumerable: true, get: function () { return withdrawalProviderExecutionFixtures_1.startCreatorWithdrawalHttpServer; } });
const createTerminalWithdrawalFixture = async (baseUrl, outcome) => {
    const fixture = await (0, withdrawalProviderExecutionFixtures_1.createInitializedWithdrawalProviderFixture)(baseUrl);
    const provider = await withdrawalProviderExecution_service_1.withdrawalProviderExecutionService.execute({
        withdrawalReference: fixture.withdrawal.withdrawalReference,
        outcome,
        ...(outcome === withdrawalProviderExecutionOutcome_enum_1.WithdrawalProviderExecutionOutcome.FAILURE
            ? {
                failureCode: "BANK_NETWORK_FAILURE",
                failureReason: "Provider rejected the withdrawal.",
            }
            : {}),
    });
    return { ...fixture, provider };
};
exports.createTerminalWithdrawalFixture = createTerminalWithdrawalFixture;
const snapshotPhase9DFinancialState = async (walletId) => {
    const wallet = await wallet_model_1.Wallet.findById(walletId).orFail();
    return {
        wallet: {
            currentBalance: wallet.currentBalance,
            availableBalance: wallet.availableBalance,
            reservedBalance: wallet.reservedBalance,
            lockedBalance: wallet.lockedBalance,
            projectionVersion: wallet.projectionVersion,
        },
        ledgerCount: await ledgerEntry_model_1.LedgerEntry.countDocuments({
            source: "WITHDRAWAL_PROVIDER_FINALIZATION",
        }),
        projectionCount: await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({
            operationKey: /^creator-withdrawal-finalization:/,
        }),
        auditCount: await auditLog_model_1.AuditLog.countDocuments({
            action: {
                $in: [
                    auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_COMPLETED,
                    auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_FAILED,
                ],
            },
        }),
    };
};
exports.snapshotPhase9DFinancialState = snapshotPhase9DFinancialState;
