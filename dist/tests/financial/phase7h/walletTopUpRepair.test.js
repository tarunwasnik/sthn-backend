"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRepairTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const mongoose_1 = require("mongoose");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletTopUpRequest_model_1 = require("../../../models/walletTopUpRequest.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const walletTopUpRepairOperation_model_1 = require("../../../models/walletTopUpRepairOperation.model");
const walletTopUpOperationalAudit_model_1 = require("../../../models/walletTopUpOperationalAudit.model");
const walletTopUpOperationalAction_enum_1 = require("../../../enums/financial/walletTopUpOperationalAction.enum");
const WalletTopUpReconciliationError_1 = require("../../../errors/financial/WalletTopUpReconciliationError");
const walletTopUpReconciliation_service_1 = require("../../../services/financial/walletTopUpReconciliation.service");
const walletTopUpRepair_service_1 = require("../../../services/financial/walletTopUpRepair.service");
const topUpFixtures_1 = require("./fixtures/topUpFixtures");
const completedWithMissingLedgerLink = async (amount) => {
    const actors = await (0, topUpFixtures_1.createActors)();
    const { request } = await (0, topUpFixtures_1.createFundedTopUp)(actors, amount);
    await (0, topUpFixtures_1.completeFundedTopUp)(request.topUpReference);
    await walletTopUpRequest_model_1.WalletTopUpRequest.collection.updateOne({ _id: request._id }, { $unset: { ledgerEntryId: "", ledgerReference: "" } });
    const inspected = await walletTopUpReconciliation_service_1.walletTopUpReconciliationService.inspectForOperation(request.topUpReference);
    return { actors, request, inspected };
};
const registerRepairTests = () => {
    (0, node_test_1.test)("phase7h repair: missing links are repaired once and exact replay is idempotent", async () => {
        const { actors, request, inspected } = await completedWithMissingLedgerLink(710);
        const beforeWallet = await wallet_model_1.Wallet.findById(actors.wallet._id);
        const first = await walletTopUpRepair_service_1.walletTopUpRepairService.repair(inspected.reconciliation.reconciliationReference, walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.REPAIR_LEDGER_LINK, actors.adminId.toString());
        const repaired = await (0, topUpFixtures_1.reloadRequest)(request.topUpReference);
        const replay = await walletTopUpRepair_service_1.walletTopUpRepairService.repair(inspected.reconciliation.reconciliationReference, walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.REPAIR_LEDGER_LINK, actors.adminId.toString());
        const afterWallet = await wallet_model_1.Wallet.findById(actors.wallet._id);
        strict_1.default.ok(repaired.ledgerEntryId);
        strict_1.default.ok(repaired.ledgerReference);
        strict_1.default.equal(beforeWallet?.availableBalance, afterWallet?.availableBalance);
        strict_1.default.equal(await walletTopUpRepairOperation_model_1.WalletTopUpRepairOperation.countDocuments({
            reconciliationReference: inspected.reconciliation.reconciliationReference,
            action: walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.REPAIR_LEDGER_LINK,
        }), 1);
        strict_1.default.equal(first.repair.operationReference, replay.repair.operationReference);
        strict_1.default.equal(await walletTopUpOperationalAudit_model_1.WalletTopUpOperationalAudit.countDocuments({
            reconciliationReference: inspected.reconciliation.reconciliationReference,
            reasonCode: "REPAIR_APPLIED",
        }), 1);
    });
    (0, node_test_1.test)("phase7h repair: stale snapshot rejects without changing links or money", async () => {
        const { actors, request, inspected } = await completedWithMissingLedgerLink(720);
        await walletTopUpRequest_model_1.WalletTopUpRequest.collection.updateOne({ _id: request._id }, { $set: { accountingTransactionId: "TUA-STALE-SNAPSHOT" } });
        const walletBefore = await wallet_model_1.Wallet.findById(actors.wallet._id);
        await strict_1.default.rejects(() => walletTopUpRepair_service_1.walletTopUpRepairService.repair(inspected.reconciliation.reconciliationReference, walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.REPAIR_LEDGER_LINK, actors.adminId.toString()), (error) => {
            strict_1.default.equal(error.code, WalletTopUpReconciliationError_1.WalletTopUpReconciliationErrorCode.SNAPSHOT_CONFLICT);
            return true;
        });
        const unchanged = await (0, topUpFixtures_1.reloadRequest)(request.topUpReference);
        strict_1.default.equal(unchanged.ledgerEntryId, undefined);
        strict_1.default.equal((await wallet_model_1.Wallet.findById(actors.wallet._id))?.availableBalance, walletBefore?.availableBalance);
        strict_1.default.equal(await walletTopUpRepairOperation_model_1.WalletTopUpRepairOperation.countDocuments({}), 0);
    });
    (0, node_test_1.test)("phase7h repair: concurrent identical repairs converge to one operation", { timeout: 60000 }, async () => {
        const { actors, request, inspected } = await completedWithMissingLedgerLink(730);
        const settled = await Promise.allSettled(Array.from({ length: 8 }, () => walletTopUpRepair_service_1.walletTopUpRepairService.repair(inspected.reconciliation.reconciliationReference, walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.REPAIR_LEDGER_LINK, actors.adminId.toString())));
        strict_1.default.ok(settled.some((item) => item.status === "fulfilled"));
        strict_1.default.equal(await walletTopUpRepairOperation_model_1.WalletTopUpRepairOperation.countDocuments({
            reconciliationReference: inspected.reconciliation.reconciliationReference,
        }), 1);
        strict_1.default.ok((await (0, topUpFixtures_1.reloadRequest)(request.topUpReference)).ledgerEntryId);
        strict_1.default.equal(await walletTopUpOperationalAudit_model_1.WalletTopUpOperationalAudit.countDocuments({
            reconciliationReference: inspected.reconciliation.reconciliationReference,
            reasonCode: "REPAIR_APPLIED",
        }), 1);
        strict_1.default.equal((await wallet_model_1.Wallet.findById(actors.wallet._id))?.availableBalance, 730);
    });
    for (const corruption of ["LEDGER_AMOUNT", "PROJECTION_DELTA", "WALLET_OWNER", "CONFLICTING_LINK"]) {
        (0, node_test_1.test)(`phase7h repair forbidden: ${corruption} cannot be repaired`, async () => {
            const { actors, request, inspected } = await completedWithMissingLedgerLink(740);
            const completed = await (0, topUpFixtures_1.reloadRequest)(request.topUpReference);
            if (corruption === "LEDGER_AMOUNT") {
                const ledger = await ledgerEntry_model_1.LedgerEntry.findOne({ "metadata.topUpReference": request.topUpReference });
                strict_1.default.ok(ledger);
                await ledgerEntry_model_1.LedgerEntry.collection.updateOne({ _id: ledger._id }, { $set: { amount: 741 } });
            }
            else if (corruption === "PROJECTION_DELTA") {
                await walletProjectionOperation_model_1.WalletProjectionOperation.collection.updateOne({ _id: completed.walletProjectionOperationId }, { $set: { "deltas.availableBalance": 741 } });
            }
            else if (corruption === "WALLET_OWNER") {
                await wallet_model_1.Wallet.collection.updateOne({ _id: actors.wallet._id }, { $set: { userId: new mongoose_1.Types.ObjectId() } });
            }
            else {
                await walletTopUpRequest_model_1.WalletTopUpRequest.collection.updateOne({ _id: request._id }, { $set: { ledgerEntryId: new mongoose_1.Types.ObjectId() } });
            }
            await walletTopUpReconciliation_service_1.walletTopUpReconciliationService.inspectForOperation(request.topUpReference);
            await strict_1.default.rejects(() => walletTopUpRepair_service_1.walletTopUpRepairService.repair(inspected.reconciliation.reconciliationReference, walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.REPAIR_LEDGER_LINK, actors.adminId.toString()));
            strict_1.default.equal(await walletTopUpRepairOperation_model_1.WalletTopUpRepairOperation.countDocuments({}), 0);
        });
    }
};
exports.registerRepairTests = registerRepairTests;
