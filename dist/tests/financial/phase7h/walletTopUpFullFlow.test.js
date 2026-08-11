"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFullFlowTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletTopUpRequestStatus_enum_1 = require("../../../enums/financial/walletTopUpRequestStatus.enum");
const internalTopUpFundingStatus_enum_1 = require("../../../enums/financial/internalTopUpFundingStatus.enum");
const ledgerEntryType_enum_1 = require("../../../enums/financial/ledgerEntryType.enum");
const ledgerSource_enum_1 = require("../../../enums/financial/ledgerSource.enum");
const ledgerAccount_enum_1 = require("../../../enums/financial/ledgerAccount.enum");
const moneyDirection_enum_1 = require("../../../enums/financial/moneyDirection.enum");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const internalTopUpFunding_model_1 = require("../../../models/internalTopUpFunding.model");
const walletTopUpReconciliation_service_1 = require("../../../services/financial/walletTopUpReconciliation.service");
const walletTopUpReconciliationClassification_enum_1 = require("../../../enums/financial/walletTopUpReconciliationClassification.enum");
const topUpFixtures_1 = require("./fixtures/topUpFixtures");
const registerFullFlowTests = () => {
    (0, node_test_1.test)("phase7h full flow: Admin-approved top-up persists one exact financial effect", async () => {
        const actors = await (0, topUpFixtures_1.createActors)();
        const initial = actors.wallet.availableBalance;
        const { request, funding } = await (0, topUpFixtures_1.createFundedTopUp)(actors, 1000);
        const providerUpdatedAt = funding.updatedAt.getTime();
        const result = await (0, topUpFixtures_1.completeFundedTopUp)(request.topUpReference);
        const [completed, ledger, operations, wallet, reconciliation] = await Promise.all([
            (0, topUpFixtures_1.reloadRequest)(request.topUpReference),
            ledgerEntry_model_1.LedgerEntry.find({ "metadata.topUpReference": request.topUpReference }),
            walletProjectionOperation_model_1.WalletProjectionOperation.find({ walletId: actors.wallet._id }),
            wallet_model_1.Wallet.findById(actors.wallet._id),
            walletTopUpReconciliation_service_1.walletTopUpReconciliationService.inspectForOperation(request.topUpReference),
        ]);
        const reloadedFunding = await internalTopUpFunding_model_1.InternalTopUpFunding.findById(funding._id);
        strict_1.default.equal(completed.status, walletTopUpRequestStatus_enum_1.WalletTopUpRequestStatus.COMPLETED);
        strict_1.default.ok(completed.providerFundingId);
        strict_1.default.ok(completed.ledgerEntryId);
        strict_1.default.ok(completed.ledgerReference);
        strict_1.default.ok(completed.walletProjectionOperationId);
        strict_1.default.ok(completed.walletProjectionOperationReference);
        strict_1.default.ok(completed.accountingTransactionId);
        strict_1.default.ok(completed.completedAt);
        strict_1.default.equal(ledger.length, 1);
        strict_1.default.equal(operations.length, 1);
        strict_1.default.ok(wallet);
        strict_1.default.equal(wallet.availableBalance, initial + 1000);
        strict_1.default.equal(wallet.currentBalance, initial + 1000);
        strict_1.default.equal(wallet.reservedBalance, 0);
        strict_1.default.equal(wallet.lockedBalance, 0);
        strict_1.default.equal(ledger[0].amount, 1000);
        strict_1.default.equal(ledger[0].currency, "INR");
        strict_1.default.equal(ledger[0].type, ledgerEntryType_enum_1.LedgerEntryType.WALLET_TOP_UP);
        strict_1.default.equal(ledger[0].source, ledgerSource_enum_1.LedgerSource.INTERNAL_TOP_UP_FUNDING);
        strict_1.default.equal(ledger[0].direction, moneyDirection_enum_1.MoneyDirection.CREDIT);
        strict_1.default.equal(ledger[0].account, ledgerAccount_enum_1.LedgerAccount.CASH);
        strict_1.default.equal(operations[0].deltas.availableBalance, 1000);
        strict_1.default.equal(operations[0].deltas.reservedBalance, 0);
        strict_1.default.equal(operations[0].deltas.lockedBalance, 0);
        strict_1.default.equal(operations[0].ledgerEntryIds.length, 1);
        strict_1.default.ok(operations[0].ledgerEntryIds[0].equals(ledger[0]._id));
        strict_1.default.equal(result.amount, 1000);
        strict_1.default.equal(result.currency, "INR");
        strict_1.default.equal(result.transactionId, completed.accountingTransactionId);
        strict_1.default.equal(reloadedFunding?.status, internalTopUpFundingStatus_enum_1.InternalTopUpFundingStatus.SUCCEEDED);
        strict_1.default.equal(reloadedFunding?.updatedAt.getTime(), providerUpdatedAt);
        strict_1.default.equal(reconciliation.observation.classification, walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.COMPLETED_VALID);
        strict_1.default.equal("fingerprint" in result, false);
        strict_1.default.equal("walletId" in result, false);
        strict_1.default.equal("userId" in result, false);
    });
};
exports.registerFullFlowTests = registerFullFlowTests;
