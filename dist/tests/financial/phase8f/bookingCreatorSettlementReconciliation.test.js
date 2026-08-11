"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBookingCreatorSettlementReconciliationTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const bookingCreatorSettlementFailureClassification_enum_1 = require("../../../enums/financial/bookingCreatorSettlementFailureClassification.enum");
const auditLog_model_1 = require("../../../models/auditLog.model");
const bookingCreatorSettlement_model_1 = require("../../../models/bookingCreatorSettlement.model");
const bookingCreatorSettlementReconciliation_model_1 = require("../../../models/bookingCreatorSettlementReconciliation.model");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const bookingCreatorSettlementReconciliation_service_1 = require("../../../services/financial/bookingCreatorSettlementReconciliation.service");
const bookingCreatorSettlementOperationalFixtures_1 = require("./fixtures/bookingCreatorSettlementOperationalFixtures");
const registerBookingCreatorSettlementReconciliationTests = () => {
    (0, node_test_1.test)("phase8f reconciliation validates the complete Phase 8E graph without financial mutation", async () => {
        const server = await (0, bookingCreatorSettlementOperationalFixtures_1.startOperationalHttpServer)();
        try {
            const fixture = await (0, bookingCreatorSettlementOperationalFixtures_1.createSettledOperationalFixture)(server.baseUrl);
            const walletBefore = await wallet_model_1.Wallet.findById(fixture.creatorWallet._id).orFail();
            const ledgerCount = await ledgerEntry_model_1.LedgerEntry.countDocuments();
            const projectionCount = await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments();
            const result = await bookingCreatorSettlementReconciliation_service_1.bookingCreatorSettlementReconciliationService.reconcile(fixture.settlement.settlementReference);
            strict_1.default.equal(result.classification, bookingCreatorSettlementFailureClassification_enum_1.BookingCreatorSettlementFailureClassification.HEALTHY);
            strict_1.default.equal(result.status, "RESOLVED");
            strict_1.default.equal(result.result, "VALID");
            strict_1.default.equal("_id" in result, false);
            strict_1.default.equal("snapshotFingerprint" in result, false);
            const walletAfter = await wallet_model_1.Wallet.findById(fixture.creatorWallet._id).orFail();
            strict_1.default.deepEqual([
                walletAfter.currentBalance,
                walletAfter.availableBalance,
                walletAfter.reservedBalance,
                walletAfter.lockedBalance,
                walletAfter.projectionVersion,
            ], [
                walletBefore.currentBalance,
                walletBefore.availableBalance,
                walletBefore.reservedBalance,
                walletBefore.lockedBalance,
                walletBefore.projectionVersion,
            ]);
            strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments(), ledgerCount);
            strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments(), projectionCount);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8f ten concurrent reconciliation runs converge on one authority", async () => {
        const server = await (0, bookingCreatorSettlementOperationalFixtures_1.startOperationalHttpServer)();
        try {
            const fixture = await (0, bookingCreatorSettlementOperationalFixtures_1.createSettledOperationalFixture)(server.baseUrl);
            const results = await Promise.all(Array.from({ length: 10 }, () => bookingCreatorSettlementReconciliation_service_1.bookingCreatorSettlementReconciliationService.reconcile(fixture.settlement.settlementReference)));
            strict_1.default.equal(new Set(results.map((item) => item.reconciliationReference)).size, 1);
            strict_1.default.equal(await bookingCreatorSettlementReconciliation_model_1.BookingCreatorSettlementReconciliation.countDocuments(), 1);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8f reconciliation classifies Ledger, projection, settlement, audit, and PENDING failures", async () => {
        const cases = [
            {
                expected: bookingCreatorSettlementFailureClassification_enum_1.BookingCreatorSettlementFailureClassification.CORRUPTED_LEDGER,
                corrupt: async (fixture) => ledgerEntry_model_1.LedgerEntry.collection.updateOne({
                    transactionId: fixture.settlement.settlementTransactionId,
                    account: "CREATOR_PAYABLE",
                }, { $set: { amount: 799 } }),
            },
            {
                expected: bookingCreatorSettlementFailureClassification_enum_1.BookingCreatorSettlementFailureClassification.CORRUPTED_PROJECTION,
                corrupt: async (fixture) => walletProjectionOperation_model_1.WalletProjectionOperation.collection.updateOne({
                    operationReference: fixture.settlement.settlementProjectionOperationReference,
                }, { $set: { "deltas.reservedBalance": 1 } }),
            },
            {
                expected: bookingCreatorSettlementFailureClassification_enum_1.BookingCreatorSettlementFailureClassification.CORRUPTED_SETTLEMENT,
                corrupt: async (fixture) => bookingCreatorSettlement_model_1.BookingCreatorSettlement.collection.updateOne({
                    _id: fixture.settlement._id,
                }, { $set: { creatorAmount: 799 } }),
            },
            {
                expected: bookingCreatorSettlementFailureClassification_enum_1.BookingCreatorSettlementFailureClassification.MISSING_AUDIT,
                corrupt: async (fixture) => auditLog_model_1.AuditLog.deleteOne({
                    action: "BOOKING_CREATOR_WALLET_SETTLED",
                    entityId: fixture.settlement._id,
                }),
            },
            {
                expected: bookingCreatorSettlementFailureClassification_enum_1.BookingCreatorSettlementFailureClassification.REPLAY_REQUIRED,
                corrupt: async (fixture) => bookingCreatorSettlement_model_1.BookingCreatorSettlement.collection.updateOne({
                    _id: fixture.settlement._id,
                }, { $set: { status: "PENDING" }, $unset: { settledAt: "" } }),
            },
            {
                expected: bookingCreatorSettlementFailureClassification_enum_1.BookingCreatorSettlementFailureClassification.PENDING,
                corrupt: async (fixture) => {
                    await Promise.all([
                        ledgerEntry_model_1.LedgerEntry.deleteMany({
                            transactionId: fixture.settlement.settlementTransactionId,
                        }),
                        walletProjectionOperation_model_1.WalletProjectionOperation.deleteOne({
                            operationReference: fixture.settlement.settlementProjectionOperationReference,
                        }),
                        auditLog_model_1.AuditLog.deleteOne({
                            action: "BOOKING_CREATOR_WALLET_SETTLED",
                            entityId: fixture.settlement._id,
                        }),
                        bookingCreatorSettlement_model_1.BookingCreatorSettlement.collection.updateOne({
                            _id: fixture.settlement._id,
                        }, {
                            $set: { status: "PENDING", settlementLedgerEntryIds: [] },
                            $unset: { settledAt: "" },
                        }),
                        wallet_model_1.Wallet.collection.updateOne({
                            _id: fixture.creatorWallet._id,
                        }, {
                            $inc: {
                                currentBalance: -fixture.settlement.creatorAmount,
                                availableBalance: -fixture.settlement.creatorAmount,
                                projectionVersion: -1,
                            },
                        }),
                    ]);
                },
            },
        ];
        for (const candidate of cases) {
            const server = await (0, bookingCreatorSettlementOperationalFixtures_1.startOperationalHttpServer)();
            try {
                const fixture = await (0, bookingCreatorSettlementOperationalFixtures_1.createSettledOperationalFixture)(server.baseUrl);
                await candidate.corrupt(fixture);
                const result = await bookingCreatorSettlementReconciliation_service_1.bookingCreatorSettlementReconciliationService.reconcile(fixture.settlement.settlementReference);
                strict_1.default.equal(result.classification, candidate.expected);
                strict_1.default.equal(result.status, "OPEN");
            }
            finally {
                await server.close();
            }
        }
    });
};
exports.registerBookingCreatorSettlementReconciliationTests = registerBookingCreatorSettlementReconciliationTests;
