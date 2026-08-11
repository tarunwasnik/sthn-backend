"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWithdrawalOperationalInspectionTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const mongoose_1 = require("mongoose");
const withdrawalProviderExecutionOutcome_enum_1 = require("../../../enums/financial/withdrawalProviderExecutionOutcome.enum");
const internalWithdrawalProviderRequest_model_1 = require("../../../models/internalProvider/internalWithdrawalProviderRequest.model");
const auditLog_model_1 = require("../../../models/auditLog.model");
const creatorWithdrawalRequest_model_1 = require("../../../models/creatorWithdrawalRequest.model");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const creatorWithdrawalOperationalInspection_service_1 = require("../../../services/financial/creatorWithdrawalOperationalInspection.service");
const database_1 = require("../phase7h/helpers/database");
const creatorWithdrawalOperationalFixtures_1 = require("./fixtures/creatorWithdrawalOperationalFixtures");
const registerWithdrawalOperationalInspectionTests = () => {
    (0, node_test_1.test)("phase9e classifies healthy completion and failure without money movement", async () => {
        for (const [outcome, classification] of [
            [withdrawalProviderExecutionOutcome_enum_1.WithdrawalProviderExecutionOutcome.SUCCESS, "HEALTHY_COMPLETED"],
            [withdrawalProviderExecutionOutcome_enum_1.WithdrawalProviderExecutionOutcome.FAILURE, "HEALTHY_FAILED"],
        ]) {
            await (0, database_1.clearPhase7HDatabase)();
            const server = await (0, creatorWithdrawalOperationalFixtures_1.startCreatorWithdrawalHttpServer)();
            try {
                const fixture = await (0, creatorWithdrawalOperationalFixtures_1.createHealthyWithdrawalFixture)(server.baseUrl, outcome);
                const before = await (0, creatorWithdrawalOperationalFixtures_1.snapshotWithdrawalOperationalMoney)(fixture.withdrawal.withdrawalReference, fixture.creatorWallet._id);
                const inspection = await creatorWithdrawalOperationalInspection_service_1.creatorWithdrawalOperationalInspectionService
                    .inspect(fixture.withdrawal.withdrawalReference);
                strict_1.default.equal(inspection.classification, classification);
                strict_1.default.deepEqual(await (0, creatorWithdrawalOperationalFixtures_1.snapshotWithdrawalOperationalMoney)(fixture.withdrawal.withdrawalReference, fixture.creatorWallet._id), before);
            }
            finally {
                await server.close();
            }
        }
    });
    (0, node_test_1.test)("phase9e classifies provider initialized and processing as non-retryable", async () => {
        for (const [processing, classification] of [
            [false, "PROVIDER_INITIALIZED"], [true, "PROVIDER_PROCESSING"],
        ]) {
            await (0, database_1.clearPhase7HDatabase)();
            const server = await (0, creatorWithdrawalOperationalFixtures_1.startCreatorWithdrawalHttpServer)();
            try {
                const fixture = await (0, creatorWithdrawalOperationalFixtures_1.createInitializedWithdrawalProviderFixture)(server.baseUrl);
                if (processing)
                    await internalWithdrawalProviderRequest_model_1.InternalWithdrawalProviderRequest.collection.updateOne({
                        withdrawalReference: fixture.withdrawal.withdrawalReference,
                    }, { $set: { providerStatus: "PROCESSING", processingAt: new Date() },
                        $inc: { version: 1 } });
                const inspection = await creatorWithdrawalOperationalInspection_service_1.creatorWithdrawalOperationalInspectionService
                    .inspect(fixture.withdrawal.withdrawalReference);
                strict_1.default.equal(inspection.classification, classification);
                strict_1.default.equal(inspection.allowedActions.includes("RETRY_FINALIZATION"), false);
            }
            finally {
                await server.close();
            }
        }
    });
    (0, node_test_1.test)("phase9e deterministically classifies financial graph corruption as non-retryable", async () => {
        const cases = [
            { expected: "AMOUNT_CONFLICT", mutate: (fixture) => internalWithdrawalProviderRequest_model_1.InternalWithdrawalProviderRequest.collection.updateOne({
                    withdrawalReference: fixture.withdrawal.withdrawalReference,
                }, { $inc: { amount: 1 } }) },
            { expected: "CURRENCY_CONFLICT", mutate: (fixture) => internalWithdrawalProviderRequest_model_1.InternalWithdrawalProviderRequest.collection.updateOne({
                    withdrawalReference: fixture.withdrawal.withdrawalReference,
                }, { $set: { currency: "USD" } }) },
            { expected: "DESTINATION_CONFLICT", mutate: (fixture) => internalWithdrawalProviderRequest_model_1.InternalWithdrawalProviderRequest.collection.updateOne({
                    withdrawalReference: fixture.withdrawal.withdrawalReference,
                }, { $set: { destinationReference: "PD-CONFLICT" } }) },
            { expected: "PROVIDER_IDENTITY_CONFLICT", mutate: (fixture) => internalWithdrawalProviderRequest_model_1.InternalWithdrawalProviderRequest.collection.updateOne({
                    withdrawalReference: fixture.withdrawal.withdrawalReference,
                }, { $set: { providerReference: "IWP-CONFLICT" } }) },
            { expected: "CORRUPTED_PROVIDER", mutate: (fixture) => internalWithdrawalProviderRequest_model_1.InternalWithdrawalProviderRequest.collection.updateOne({
                    withdrawalReference: fixture.withdrawal.withdrawalReference,
                }, { $set: { "terminalResult.outcome": "FAILURE" } }) },
            { expected: "CORRUPTED_RESERVATION_LEDGER", mutate: async (fixture) => {
                    const withdrawal = await creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.findOne({
                        withdrawalReference: fixture.withdrawal.withdrawalReference,
                    }).select("+ledgerTransactionReference").orFail();
                    return ledgerEntry_model_1.LedgerEntry.deleteOne({
                        transactionId: withdrawal.ledgerTransactionReference,
                    });
                } },
            { expected: "CORRUPTED_RESERVATION_LEDGER", mutate: async (fixture) => {
                    const withdrawal = await creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.findOne({
                        withdrawalReference: fixture.withdrawal.withdrawalReference,
                    }).select("+ledgerTransactionReference").orFail();
                    const entry = await ledgerEntry_model_1.LedgerEntry.findOne({
                        transactionId: withdrawal.ledgerTransactionReference,
                    }).lean().orFail();
                    const { _id, ledgerReference, postingKey, ...copy } = entry;
                    return ledgerEntry_model_1.LedgerEntry.collection.insertOne({ ...copy,
                        ledgerReference: `${ledgerReference}-duplicate`,
                        postingKey: `${postingKey}-duplicate` });
                } },
            { expected: "CORRUPTED_RESERVATION_PROJECTION", mutate: async (fixture) => {
                    const withdrawal = await creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.findOne({
                        withdrawalReference: fixture.withdrawal.withdrawalReference,
                    }).orFail();
                    return walletProjectionOperation_model_1.WalletProjectionOperation.collection.updateOne({
                        operationReference: withdrawal.projectionReference,
                    }, { $set: { "deltas.reservedBalance": 1 } });
                } },
            { expected: "CORRUPTED_WALLET", mutate: (fixture) => wallet_model_1.Wallet.collection.updateOne({ _id: fixture.creatorWallet._id }, { $inc: { currentBalance: 1 } }) },
            { expected: "CORRUPTED_WALLET", mutate: (fixture) => wallet_model_1.Wallet.collection.updateOne({ _id: fixture.creatorWallet._id }, { $set: { userId: new mongoose_1.Types.ObjectId() } }) },
            { expected: "CORRUPTED_FINALIZATION_LEDGER", mutate: async (fixture) => {
                    const withdrawal = await creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.findOne({
                        withdrawalReference: fixture.withdrawal.withdrawalReference,
                    }).select("+finalizationTransactionId").orFail();
                    return ledgerEntry_model_1.LedgerEntry.deleteOne({
                        transactionId: withdrawal.finalizationTransactionId,
                    });
                } },
            { expected: "CORRUPTED_FINALIZATION_LEDGER", mutate: async (fixture) => {
                    const withdrawal = await creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.findOne({
                        withdrawalReference: fixture.withdrawal.withdrawalReference,
                    }).select("+finalizationTransactionId").orFail();
                    const entry = await ledgerEntry_model_1.LedgerEntry.findOne({
                        transactionId: withdrawal.finalizationTransactionId,
                    }).select("+postingKey").lean().orFail();
                    const { _id, ledgerReference, postingKey, ...copy } = entry;
                    return ledgerEntry_model_1.LedgerEntry.collection.insertOne({ ...copy,
                        ledgerReference: `${ledgerReference}-duplicate`,
                        postingKey: `${postingKey}-duplicate` });
                } },
            { expected: "CORRUPTED_FINALIZATION_LEDGER", mutate: async (fixture) => {
                    const withdrawal = await creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.findOne({
                        withdrawalReference: fixture.withdrawal.withdrawalReference,
                    }).select("+finalizationTransactionId").orFail();
                    return ledgerEntry_model_1.LedgerEntry.collection.updateOne({
                        transactionId: withdrawal.finalizationTransactionId,
                        account: "PAYOUT_CLEARING",
                    }, { $set: { account: "WALLET_AVAILABLE" } });
                } },
            { expected: "CORRUPTED_FINALIZATION_LEDGER", mutate: async (fixture) => {
                    const withdrawal = await creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.findOne({
                        withdrawalReference: fixture.withdrawal.withdrawalReference,
                    }).select("+finalizationTransactionId").orFail();
                    return ledgerEntry_model_1.LedgerEntry.collection.updateOne({
                        transactionId: withdrawal.finalizationTransactionId,
                        account: "PAYOUT_CLEARING",
                    }, { $set: { direction: "DEBIT" } });
                } },
            { expected: "CORRUPTED_FINALIZATION_LEDGER", mutate: async (fixture) => {
                    const withdrawal = await creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.findOne({
                        withdrawalReference: fixture.withdrawal.withdrawalReference,
                    }).select("+finalizationTransactionId").orFail();
                    return ledgerEntry_model_1.LedgerEntry.collection.updateOne({
                        transactionId: withdrawal.finalizationTransactionId,
                    }, { $inc: { amount: 1 } });
                } },
            { expected: "CORRUPTED_FINALIZATION_LEDGER", mutate: async (fixture) => {
                    const withdrawal = await creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.findOne({
                        withdrawalReference: fixture.withdrawal.withdrawalReference,
                    }).select("+finalizationTransactionId").orFail();
                    return ledgerEntry_model_1.LedgerEntry.collection.updateOne({
                        transactionId: withdrawal.finalizationTransactionId,
                    }, { $set: { currency: "USD" } });
                } },
            { expected: "CORRUPTED_FINALIZATION_PROJECTION", mutate: async (fixture) => {
                    const withdrawal = await creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.findOne({
                        withdrawalReference: fixture.withdrawal.withdrawalReference,
                    }).select("+finalizationProjectionOperationReference").orFail();
                    return walletProjectionOperation_model_1.WalletProjectionOperation.deleteOne({ operationReference: withdrawal.finalizationProjectionOperationReference });
                } },
            { expected: "CORRUPTED_FINALIZATION_PROJECTION", mutate: async (fixture) => {
                    const withdrawal = await creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.findOne({
                        withdrawalReference: fixture.withdrawal.withdrawalReference,
                    }).select("+finalizationProjectionOperationReference").orFail();
                    return walletProjectionOperation_model_1.WalletProjectionOperation.collection.updateOne({
                        operationReference: withdrawal.finalizationProjectionOperationReference,
                    }, { $set: { "deltas.reservedBalance": 0 } });
                } },
            { expected: "OUTCOME_CONFLICT", mutate: (fixture) => creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.collection.updateOne({
                    withdrawalReference: fixture.withdrawal.withdrawalReference,
                }, { $set: { status: "FAILED" } }) },
            { expected: "MISSING_AUDIT", mutate: () => auditLog_model_1.AuditLog.deleteOne({
                    action: "CREATOR_WITHDRAWAL_COMPLETED",
                }) },
            { expected: "TRANSACTION_CONFLICT", mutate: (fixture) => creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.collection.updateOne({
                    withdrawalReference: fixture.withdrawal.withdrawalReference,
                }, { $set: { finalizationTransactionId: "conflicting-transaction" } }) },
            { expected: "TRANSACTION_CONFLICT", mutate: (fixture) => creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.collection.updateOne({
                    withdrawalReference: fixture.withdrawal.withdrawalReference,
                }, { $set: { finalizationProjectionOperationReference: "conflicting-projection" } }) },
        ];
        for (const item of cases) {
            await (0, database_1.clearPhase7HDatabase)();
            const server = await (0, creatorWithdrawalOperationalFixtures_1.startCreatorWithdrawalHttpServer)();
            try {
                const fixture = await (0, creatorWithdrawalOperationalFixtures_1.createHealthyWithdrawalFixture)(server.baseUrl, withdrawalProviderExecutionOutcome_enum_1.WithdrawalProviderExecutionOutcome.SUCCESS);
                await item.mutate(fixture);
                const inspection = await creatorWithdrawalOperationalInspection_service_1.creatorWithdrawalOperationalInspectionService
                    .inspect(fixture.withdrawal.withdrawalReference);
                strict_1.default.equal(inspection.classification, item.expected);
                strict_1.default.equal(inspection.allowedActions.includes("RETRY_FINALIZATION"), false);
            }
            finally {
                await server.close();
            }
        }
    });
};
exports.registerWithdrawalOperationalInspectionTests = registerWithdrawalOperationalInspectionTests;
