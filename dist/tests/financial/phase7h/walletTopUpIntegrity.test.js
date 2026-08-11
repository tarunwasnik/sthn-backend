"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerIntegrityTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const mongoose_1 = __importStar(require("mongoose"));
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletTopUpRequest_model_1 = require("../../../models/walletTopUpRequest.model");
const internalTopUpFunding_model_1 = require("../../../models/internalTopUpFunding.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const walletTopUpReconciliation_model_1 = require("../../../models/walletTopUpReconciliation.model");
const walletTopUpRetryAttempt_model_1 = require("../../../models/walletTopUpRetryAttempt.model");
const walletTopUpRepairOperation_model_1 = require("../../../models/walletTopUpRepairOperation.model");
const walletTopUpOperationalAudit_model_1 = require("../../../models/walletTopUpOperationalAudit.model");
const walletProjection_service_1 = require("../../../services/wallet/walletProjection.service");
const walletTopUpProviderFailure_service_1 = require("../../../services/financial/walletTopUpProviderFailure.service");
const walletTopUpReconciliation_service_1 = require("../../../services/financial/walletTopUpReconciliation.service");
const walletTopUpRepair_service_1 = require("../../../services/financial/walletTopUpRepair.service");
const walletTopUpOperationalAction_enum_1 = require("../../../enums/financial/walletTopUpOperationalAction.enum");
const internalTopUpFundingOutcome_enum_1 = require("../../../enums/financial/internalTopUpFundingOutcome.enum");
const FinancialError_1 = require("../../../errors/financial/FinancialError");
const topUpFixtures_1 = require("./fixtures/topUpFixtures");
const corruptions = [
    "MISSING_PROVIDER_LINK", "WRONG_PROVIDER_REFERENCE", "PROVIDER_NOT_SUCCEEDED",
    "MISSING_LEDGER", "WRONG_LEDGER_REFERENCE", "WRONG_LEDGER_AMOUNT",
    "WRONG_LEDGER_CURRENCY", "WRONG_LEDGER_USER", "WRONG_LEDGER_SOURCE_TYPE",
    "MISSING_PROJECTION", "PROJECTION_WRONG_LEDGER", "PROJECTION_WRONG_WALLET",
    "PROJECTION_WRONG_DELTA", "MISSING_TRANSACTION", "TRANSACTION_MISMATCH",
    "WALLET_OWNER", "WALLET_CURRENCY", "MISSING_COMPLETION",
];
const mutateCorruption = async (corruption, requestId, fundingId, ledgerId, operationId, walletId) => {
    switch (corruption) {
        case "MISSING_PROVIDER_LINK":
            return walletTopUpRequest_model_1.WalletTopUpRequest.collection.updateOne({ _id: requestId }, { $unset: { providerFundingId: "" } });
        case "WRONG_PROVIDER_REFERENCE":
            return walletTopUpRequest_model_1.WalletTopUpRequest.collection.updateOne({ _id: requestId }, { $set: { providerFundingReference: "ITF-WRONG" } });
        case "PROVIDER_NOT_SUCCEEDED":
            return internalTopUpFunding_model_1.InternalTopUpFunding.collection.updateOne({ _id: fundingId }, { $set: { status: "PROCESSING" } });
        case "MISSING_LEDGER":
            return ledgerEntry_model_1.LedgerEntry.collection.deleteOne({ _id: ledgerId });
        case "WRONG_LEDGER_REFERENCE":
            return walletTopUpRequest_model_1.WalletTopUpRequest.collection.updateOne({ _id: requestId }, { $set: { ledgerReference: "LEDGER-WRONG" } });
        case "WRONG_LEDGER_AMOUNT":
            return ledgerEntry_model_1.LedgerEntry.collection.updateOne({ _id: ledgerId }, { $set: { amount: 999999 } });
        case "WRONG_LEDGER_CURRENCY":
            return ledgerEntry_model_1.LedgerEntry.collection.updateOne({ _id: ledgerId }, { $set: { currency: "USD" } });
        case "WRONG_LEDGER_USER":
            return ledgerEntry_model_1.LedgerEntry.collection.updateOne({ _id: ledgerId }, { $set: { userId: new mongoose_1.Types.ObjectId() } });
        case "WRONG_LEDGER_SOURCE_TYPE":
            return ledgerEntry_model_1.LedgerEntry.collection.updateOne({ _id: ledgerId }, { $set: { source: "PAYMENT", type: "SETTLEMENT" } });
        case "MISSING_PROJECTION":
            return walletProjectionOperation_model_1.WalletProjectionOperation.collection.deleteOne({ _id: operationId });
        case "PROJECTION_WRONG_LEDGER":
            return walletProjectionOperation_model_1.WalletProjectionOperation.collection.updateOne({ _id: operationId }, { $set: { ledgerEntryIds: [new mongoose_1.Types.ObjectId()] } });
        case "PROJECTION_WRONG_WALLET":
            return walletProjectionOperation_model_1.WalletProjectionOperation.collection.updateOne({ _id: operationId }, { $set: { walletId: new mongoose_1.Types.ObjectId() } });
        case "PROJECTION_WRONG_DELTA":
            return walletProjectionOperation_model_1.WalletProjectionOperation.collection.updateOne({ _id: operationId }, { $set: { "deltas.availableBalance": 999999 } });
        case "MISSING_TRANSACTION":
            return walletTopUpRequest_model_1.WalletTopUpRequest.collection.updateOne({ _id: requestId }, { $unset: { accountingTransactionId: "" } });
        case "TRANSACTION_MISMATCH":
            return walletTopUpRequest_model_1.WalletTopUpRequest.collection.updateOne({ _id: requestId }, { $set: { accountingTransactionId: "TUA-MISMATCH" } });
        case "WALLET_OWNER":
            return wallet_model_1.Wallet.collection.updateOne({ _id: walletId }, { $set: { userId: new mongoose_1.Types.ObjectId() } });
        case "WALLET_CURRENCY":
            return wallet_model_1.Wallet.collection.updateOne({ _id: walletId }, { $set: { currency: "USD" } });
        case "MISSING_COMPLETION":
            return walletTopUpRequest_model_1.WalletTopUpRequest.collection.updateOne({ _id: requestId }, { $unset: { completedAt: "", accountingCompletedAt: "" } });
    }
};
const registerIntegrityTests = () => {
    for (const corruption of corruptions) {
        (0, node_test_1.test)(`phase7h completed corruption fails closed: ${corruption}`, async () => {
            const actors = await (0, topUpFixtures_1.createActors)();
            const { request, funding } = await (0, topUpFixtures_1.createFundedTopUp)(actors, 515);
            await (0, topUpFixtures_1.completeFundedTopUp)(request.topUpReference);
            const completed = await (0, topUpFixtures_1.reloadRequest)(request.topUpReference);
            strict_1.default.ok(completed.ledgerEntryId && completed.walletProjectionOperationId);
            const beforeWallet = await wallet_model_1.Wallet.findById(actors.wallet._id);
            const beforeLedgerCount = await ledgerEntry_model_1.LedgerEntry.countDocuments({});
            const beforeProjectionCount = await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({});
            await mutateCorruption(corruption, completed._id, funding._id, completed.ledgerEntryId, completed.walletProjectionOperationId, actors.wallet._id);
            const providerStatus = (await internalTopUpFunding_model_1.InternalTopUpFunding.findById(funding._id))?.status;
            await strict_1.default.rejects(() => (0, topUpFixtures_1.completeFundedTopUp)(request.topUpReference), (error) => {
                strict_1.default.ok(error instanceof FinancialError_1.FinancialError);
                strict_1.default.match(error.code, /^WALLET_TOP_UP_ACCOUNTING_/);
                return true;
            });
            strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({}), beforeLedgerCount -
                (corruption === "MISSING_LEDGER" ? 1 : 0));
            strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({}), beforeProjectionCount -
                (corruption === "MISSING_PROJECTION" ? 1 : 0));
            strict_1.default.equal((await wallet_model_1.Wallet.findById(actors.wallet._id))?.availableBalance, beforeWallet?.availableBalance);
            strict_1.default.equal((await walletTopUpRequest_model_1.WalletTopUpRequest.findById(request._id))?.status, "COMPLETED");
            strict_1.default.equal((await internalTopUpFunding_model_1.InternalTopUpFunding.findById(funding._id))?.status, providerStatus);
        });
    }
    (0, node_test_1.test)("phase7h Wallet-versus-Ledger proof includes replay, failed top-up, repair, and inspection", async () => {
        const actors = await (0, topUpFixtures_1.createActors)();
        const amounts = [1000, 2500, 400];
        const successful = [];
        for (const amount of amounts) {
            const fixture = await (0, topUpFixtures_1.createFundedTopUp)(actors, amount);
            await (0, topUpFixtures_1.completeFundedTopUp)(fixture.request.topUpReference);
            successful.push(fixture);
        }
        await (0, topUpFixtures_1.completeFundedTopUp)(successful[0].request.topUpReference);
        const failed = await (0, topUpFixtures_1.createFundedTopUp)(actors, 900, internalTopUpFundingOutcome_enum_1.InternalTopUpFundingOutcome.FAILURE);
        await walletTopUpProviderFailure_service_1.walletTopUpProviderFailureService.finalize(failed.request.topUpReference, actors.adminId.toString());
        await walletTopUpRequest_model_1.WalletTopUpRequest.collection.updateOne({ _id: successful[1].request._id }, { $unset: { ledgerReference: "", ledgerEntryId: "" } });
        const repairCase = await walletTopUpReconciliation_service_1.walletTopUpReconciliationService.inspectForOperation(successful[1].request.topUpReference);
        await walletTopUpRepair_service_1.walletTopUpRepairService.repair(repairCase.reconciliation.reconciliationReference, walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.REPAIR_LEDGER_LINK, actors.adminId.toString());
        await walletTopUpReconciliation_service_1.walletTopUpReconciliationService.inspect(successful[2].request.topUpReference, actors.adminId.toString());
        const ledgers = await ledgerEntry_model_1.LedgerEntry.find({ userId: actors.userId, type: "WALLET_TOP_UP" });
        const operations = await walletProjectionOperation_model_1.WalletProjectionOperation.find({ walletId: actors.wallet._id });
        const wallet = await wallet_model_1.Wallet.findById(actors.wallet._id);
        const ledgerTotal = ledgers.reduce((sum, entry) => sum + entry.amount, 0);
        const projectionTotal = operations.reduce((sum, operation) => sum + operation.deltas.availableBalance, 0);
        strict_1.default.equal(ledgerTotal, 3900);
        strict_1.default.equal(projectionTotal, 3900);
        strict_1.default.equal(wallet?.availableBalance, 3900);
        strict_1.default.equal(wallet?.currentBalance, 3900);
        strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({}), 3);
        strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({}), 3);
    });
    (0, node_test_1.test)("phase7h explicit session: projection transaction abort leaves no operation or balance delta", async () => {
        const actors = await (0, topUpFixtures_1.createActors)();
        const { request, funding } = await (0, topUpFixtures_1.createFundedTopUp)(actors, 333);
        const { ledger, identity } = await (0, topUpFixtures_1.establishLedgerStage)(request, funding);
        const session = await mongoose_1.default.startSession();
        await strict_1.default.rejects(() => session.withTransaction(async () => {
            await walletProjection_service_1.walletProjectionService.applyProjectionMutation({
                userId: request.userId,
                currency: request.currency,
                operationKey: identity.operationKey,
                deltas: { availableBalance: request.amount },
                ledgerEntryIds: [ledger._id],
            }, session);
            throw new Error("ABORT_PHASE7H_TRANSACTION");
        }));
        await session.endSession();
        strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({ operationKey: identity.operationKey }), 0);
        strict_1.default.equal((await wallet_model_1.Wallet.findById(actors.wallet._id))?.availableBalance, 0);
    });
    (0, node_test_1.test)("phase7h MongoDB indexes enforce deterministic identities", async () => {
        const collections = [
            walletTopUpRequest_model_1.WalletTopUpRequest, internalTopUpFunding_model_1.InternalTopUpFunding, ledgerEntry_model_1.LedgerEntry, walletProjectionOperation_model_1.WalletProjectionOperation,
            walletTopUpReconciliation_model_1.WalletTopUpReconciliation, walletTopUpRetryAttempt_model_1.WalletTopUpRetryAttempt,
            walletTopUpRepairOperation_model_1.WalletTopUpRepairOperation, walletTopUpOperationalAudit_model_1.WalletTopUpOperationalAudit,
        ];
        for (const model of collections) {
            const indexes = await model.collection.indexes();
            strict_1.default.ok(indexes.some((index) => index.name === "_id_"));
        }
        const uniqueKeys = async (model) => (await model.collection.indexes())
            .filter((index) => index.unique)
            .map((index) => JSON.stringify(index.key));
        strict_1.default.ok((await uniqueKeys(walletTopUpRequest_model_1.WalletTopUpRequest)).some((key) => key.includes("topUpReference")));
        strict_1.default.ok((await internalTopUpFunding_model_1.InternalTopUpFunding.collection.indexes()).some((index) => index.unique && "topUpRequestId" in index.key));
        strict_1.default.ok((await ledgerEntry_model_1.LedgerEntry.collection.indexes()).some((index) => index.unique && "postingKey" in index.key));
        strict_1.default.ok((await walletProjectionOperation_model_1.WalletProjectionOperation.collection.indexes()).some((index) => index.unique && "operationKey" in index.key));
        strict_1.default.ok((await walletTopUpReconciliation_model_1.WalletTopUpReconciliation.collection.indexes()).some((index) => index.unique && "reconciliationKey" in index.key));
        strict_1.default.ok((await walletTopUpRetryAttempt_model_1.WalletTopUpRetryAttempt.collection.indexes()).some((index) => index.unique && "operationKey" in index.key));
        strict_1.default.ok((await walletTopUpRepairOperation_model_1.WalletTopUpRepairOperation.collection.indexes()).some((index) => index.unique && "operationKey" in index.key));
        strict_1.default.ok((await walletTopUpOperationalAudit_model_1.WalletTopUpOperationalAudit.collection.indexes()).some((index) => index.unique && "auditReference" in index.key));
    });
};
exports.registerIntegrityTests = registerIntegrityTests;
