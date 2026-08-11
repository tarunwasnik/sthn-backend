"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWithdrawalIntegrityTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const mongoose_1 = require("mongoose");
const auditAction_enum_1 = require("../../../enums/financial/auditAction.enum");
const ledgerAccount_enum_1 = require("../../../enums/financial/ledgerAccount.enum");
const ledgerEntryType_enum_1 = require("../../../enums/financial/ledgerEntryType.enum");
const withdrawalProviderExecutionOutcome_enum_1 = require("../../../enums/financial/withdrawalProviderExecutionOutcome.enum");
const auditLog_model_1 = require("../../../models/auditLog.model");
const creatorWithdrawalRequest_model_1 = require("../../../models/creatorWithdrawalRequest.model");
const internalWithdrawalProviderRequest_model_1 = require("../../../models/internalProvider/internalWithdrawalProviderRequest.model");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const creatorWithdrawalFinalization_service_1 = require("../../../services/financial/creatorWithdrawalFinalization.service");
const database_1 = require("../phase7h/helpers/database");
const creatorWithdrawalFinalizationFixtures_1 = require("./fixtures/creatorWithdrawalFinalizationFixtures");
const isPhase9DError = (error) => error.code?.startsWith("CREATOR_WITHDRAWAL_FINALIZATION_") === true;
const registerWithdrawalIntegrityTests = () => {
    (0, node_test_1.test)("phase9d pre-finalization authority corruption fails closed", async () => {
        const corruptions = [
            {
                name: "missing provider request",
                mutate: (fixture) => internalWithdrawalProviderRequest_model_1.InternalWithdrawalProviderRequest.deleteOne({
                    withdrawalReference: fixture.withdrawal.withdrawalReference,
                }),
            },
            {
                name: "provider amount conflict",
                mutate: (fixture) => internalWithdrawalProviderRequest_model_1.InternalWithdrawalProviderRequest.collection
                    .updateOne({ withdrawalReference: fixture.withdrawal.withdrawalReference }, { $inc: { amount: 1 } }),
            },
            {
                name: "provider status conflict",
                mutate: (fixture) => internalWithdrawalProviderRequest_model_1.InternalWithdrawalProviderRequest.collection
                    .updateOne({ withdrawalReference: fixture.withdrawal.withdrawalReference }, { $set: { providerStatus: "PROCESSING", isTerminal: false } }),
            },
            {
                name: "provider currency conflict",
                mutate: (fixture) => internalWithdrawalProviderRequest_model_1.InternalWithdrawalProviderRequest.collection
                    .updateOne({ withdrawalReference: fixture.withdrawal.withdrawalReference }, { $set: { currency: "USD" } }),
            },
            {
                name: "destination conflict",
                mutate: (fixture) => internalWithdrawalProviderRequest_model_1.InternalWithdrawalProviderRequest.collection
                    .updateOne({ withdrawalReference: fixture.withdrawal.withdrawalReference }, { $set: { destinationReference: "PD-CONFLICT" } }),
            },
            {
                name: "missing original reservation Ledger",
                mutate: async (fixture) => {
                    const withdrawal = await creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.findOne({
                        withdrawalReference: fixture.withdrawal.withdrawalReference,
                    }).select("+ledgerTransactionReference").orFail();
                    return ledgerEntry_model_1.LedgerEntry.deleteOne({
                        transactionId: withdrawal.ledgerTransactionReference,
                    });
                },
            },
            {
                name: "insufficient reserved balance",
                mutate: (fixture) => wallet_model_1.Wallet.collection.updateOne({ _id: fixture.creatorWallet._id }, { $inc: { reservedBalance: -1, availableBalance: 1 } }),
            },
            {
                name: "corrupted original reservation projection",
                mutate: async (fixture) => {
                    const withdrawal = await creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.findOne({
                        withdrawalReference: fixture.withdrawal.withdrawalReference,
                    }).orFail();
                    return walletProjectionOperation_model_1.WalletProjectionOperation.collection.updateOne({
                        operationReference: withdrawal.projectionReference,
                    }, { $set: { "deltas.reservedBalance": 1 } });
                },
            },
            {
                name: "wrong Wallet owner",
                mutate: (fixture) => wallet_model_1.Wallet.collection.updateOne({ _id: fixture.creatorWallet._id }, { $set: { userId: new mongoose_1.Types.ObjectId() } }),
            },
            {
                name: "wrong Wallet currency",
                mutate: (fixture) => wallet_model_1.Wallet.collection.updateOne({ _id: fixture.creatorWallet._id }, { $set: { currency: "USD" } }),
            },
        ];
        for (const corruption of corruptions) {
            await (0, database_1.clearPhase7HDatabase)();
            const server = await (0, creatorWithdrawalFinalizationFixtures_1.startCreatorWithdrawalHttpServer)();
            try {
                const fixture = await (0, creatorWithdrawalFinalizationFixtures_1.createTerminalWithdrawalFixture)(server.baseUrl, withdrawalProviderExecutionOutcome_enum_1.WithdrawalProviderExecutionOutcome.SUCCESS);
                await corruption.mutate(fixture);
                await strict_1.default.rejects(creatorWithdrawalFinalization_service_1.creatorWithdrawalFinalizationService.finalize(fixture.withdrawal.withdrawalReference), isPhase9DError, corruption.name);
                const state = await (0, creatorWithdrawalFinalizationFixtures_1.snapshotPhase9DFinancialState)(fixture.creatorWallet._id);
                strict_1.default.equal(state.ledgerCount, 0, corruption.name);
                strict_1.default.equal(state.projectionCount, 0, corruption.name);
                strict_1.default.equal(state.auditCount, 0, corruption.name);
            }
            finally {
                await server.close();
            }
        }
    });
    (0, node_test_1.test)("phase9d terminal Ledger, projection, metadata, and audit corruption fail replay", async () => {
        const corruptions = [
            "Ledger account/direction conflict",
            "projection delta conflict",
            "partial terminal metadata",
            "finalization transaction conflict",
            "terminal audit missing",
            "completed withdrawal with failure Ledger",
        ];
        for (const corruption of corruptions) {
            await (0, database_1.clearPhase7HDatabase)();
            const server = await (0, creatorWithdrawalFinalizationFixtures_1.startCreatorWithdrawalHttpServer)();
            try {
                const fixture = await (0, creatorWithdrawalFinalizationFixtures_1.createTerminalWithdrawalFixture)(server.baseUrl, withdrawalProviderExecutionOutcome_enum_1.WithdrawalProviderExecutionOutcome.SUCCESS);
                await creatorWithdrawalFinalization_service_1.creatorWithdrawalFinalizationService.finalize(fixture.withdrawal.withdrawalReference);
                const withdrawal = await creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.findOne({
                    withdrawalReference: fixture.withdrawal.withdrawalReference,
                }).select("+finalizationTransactionId " +
                    "+finalizationProjectionOperationReference").orFail();
                if (corruption === "Ledger account/direction conflict") {
                    await ledgerEntry_model_1.LedgerEntry.collection.updateOne({
                        transactionId: withdrawal.finalizationTransactionId,
                        account: ledgerAccount_enum_1.LedgerAccount.PAYOUT_CLEARING,
                    }, { $set: { account: ledgerAccount_enum_1.LedgerAccount.WALLET_AVAILABLE } });
                }
                else if (corruption === "projection delta conflict") {
                    await walletProjectionOperation_model_1.WalletProjectionOperation.collection.updateOne({
                        operationReference: withdrawal.finalizationProjectionOperationReference,
                    }, { $set: { "deltas.availableBalance": 1 } });
                }
                else if (corruption === "partial terminal metadata") {
                    await creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.collection.updateOne({
                        _id: withdrawal._id,
                    }, { $unset: { finalizationFingerprint: "" } });
                }
                else if (corruption === "finalization transaction conflict") {
                    await creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.collection.updateOne({
                        _id: withdrawal._id,
                    }, { $set: { finalizationTransactionId: "conflicting-transaction" } });
                }
                else if (corruption === "terminal audit missing") {
                    await auditLog_model_1.AuditLog.deleteOne({
                        action: auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_COMPLETED,
                    });
                }
                else {
                    await ledgerEntry_model_1.LedgerEntry.collection.updateMany({
                        transactionId: withdrawal.finalizationTransactionId,
                    }, { $set: {
                            type: ledgerEntryType_enum_1.LedgerEntryType.CREATOR_WITHDRAWAL_FAILED_RELEASED,
                        } });
                }
                await strict_1.default.rejects(creatorWithdrawalFinalization_service_1.creatorWithdrawalFinalizationService.validateReplay(fixture.withdrawal.withdrawalReference), isPhase9DError, corruption);
            }
            finally {
                await server.close();
            }
        }
    });
    (0, node_test_1.test)("phase9d failed withdrawal with success Ledger fails replay", async () => {
        const server = await (0, creatorWithdrawalFinalizationFixtures_1.startCreatorWithdrawalHttpServer)();
        try {
            const fixture = await (0, creatorWithdrawalFinalizationFixtures_1.createTerminalWithdrawalFixture)(server.baseUrl, withdrawalProviderExecutionOutcome_enum_1.WithdrawalProviderExecutionOutcome.FAILURE);
            await creatorWithdrawalFinalization_service_1.creatorWithdrawalFinalizationService.finalize(fixture.withdrawal.withdrawalReference);
            const withdrawal = await creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.findOne({
                withdrawalReference: fixture.withdrawal.withdrawalReference,
            }).select("+finalizationTransactionId").orFail();
            await ledgerEntry_model_1.LedgerEntry.collection.updateMany({
                transactionId: withdrawal.finalizationTransactionId,
            }, { $set: { type: ledgerEntryType_enum_1.LedgerEntryType.CREATOR_WITHDRAWAL_COMPLETED } });
            await strict_1.default.rejects(creatorWithdrawalFinalization_service_1.creatorWithdrawalFinalizationService.validateReplay(fixture.withdrawal.withdrawalReference), isPhase9DError);
        }
        finally {
            await server.close();
        }
    });
};
exports.registerWithdrawalIntegrityTests = registerWithdrawalIntegrityTests;
