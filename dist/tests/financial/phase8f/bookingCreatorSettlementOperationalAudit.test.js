"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBookingCreatorSettlementOperationalAuditTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const auditAction_enum_1 = require("../../../enums/financial/auditAction.enum");
const bookingCreatorSettlementReconciliation_enum_1 = require("../../../enums/financial/bookingCreatorSettlementReconciliation.enum");
const auditLog_model_1 = require("../../../models/auditLog.model");
const bookingCreatorSettlement_model_1 = require("../../../models/bookingCreatorSettlement.model");
const bookingCreatorSettlementReconciliation_model_1 = require("../../../models/bookingCreatorSettlementReconciliation.model");
const bookingCreatorSettlementRepairOperation_model_1 = require("../../../models/bookingCreatorSettlementRepairOperation.model");
const bookingCreatorSettlementRetryAttempt_model_1 = require("../../../models/bookingCreatorSettlementRetryAttempt.model");
const wallet_model_1 = require("../../../models/wallet.model");
const bookingCreatorSettlementReconciliation_service_1 = require("../../../services/financial/bookingCreatorSettlementReconciliation.service");
const bookingCreatorSettlementRepair_service_1 = require("../../../services/financial/bookingCreatorSettlementRepair.service");
const bookingCreatorSettlementRetry_service_1 = require("../../../services/financial/bookingCreatorSettlementRetry.service");
const bookingCreatorSettlementOperationalFixtures_1 = require("./fixtures/bookingCreatorSettlementOperationalFixtures");
const registerBookingCreatorSettlementOperationalAuditTests = () => {
    (0, node_test_1.test)("phase8f reconciliation audit failure rolls back its authority", async () => {
        const server = await (0, bookingCreatorSettlementOperationalFixtures_1.startOperationalHttpServer)();
        const model = auditLog_model_1.AuditLog;
        const original = model.create;
        try {
            const fixture = await (0, bookingCreatorSettlementOperationalFixtures_1.createSettledOperationalFixture)(server.baseUrl);
            model.create = (async () => {
                throw new Error("controlled reconciliation audit failure");
            });
            await strict_1.default.rejects(bookingCreatorSettlementReconciliation_service_1.bookingCreatorSettlementReconciliationService.reconcile(fixture.settlement.settlementReference));
            strict_1.default.equal(await bookingCreatorSettlementReconciliation_model_1.BookingCreatorSettlementReconciliation.countDocuments(), 0);
        }
        finally {
            model.create = original;
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8f retry audit failure rolls back retry and completion guard", async () => {
        const server = await (0, bookingCreatorSettlementOperationalFixtures_1.startOperationalHttpServer)();
        const model = auditLog_model_1.AuditLog;
        const original = model.create;
        try {
            const fixture = await (0, bookingCreatorSettlementOperationalFixtures_1.createSettledOperationalFixture)(server.baseUrl);
            await bookingCreatorSettlement_model_1.BookingCreatorSettlement.collection.updateOne({
                _id: fixture.settlement._id,
            }, { $set: { status: "PENDING" }, $unset: { settledAt: "" } });
            const reconciliation = await bookingCreatorSettlementReconciliation_service_1.bookingCreatorSettlementReconciliationService.reconcile(fixture.settlement.settlementReference);
            const walletBefore = await wallet_model_1.Wallet.findById(fixture.creatorWallet._id).orFail();
            model.create = (async () => {
                throw new Error("controlled retry audit failure");
            });
            await strict_1.default.rejects(bookingCreatorSettlementRetry_service_1.bookingCreatorSettlementRetryService.retry(reconciliation.reconciliationReference));
            strict_1.default.equal((await bookingCreatorSettlement_model_1.BookingCreatorSettlement.findById(fixture.settlement._id).orFail()).status, "PENDING");
            strict_1.default.equal(await bookingCreatorSettlementRetryAttempt_model_1.BookingCreatorSettlementRetryAttempt.countDocuments(), 0);
            const walletAfter = await wallet_model_1.Wallet.findById(fixture.creatorWallet._id).orFail();
            strict_1.default.equal(walletAfter.currentBalance, walletBefore.currentBalance);
            strict_1.default.equal(walletAfter.projectionVersion, walletBefore.projectionVersion);
        }
        finally {
            model.create = original;
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8f repair operational-audit failure rolls back the complete repair", async () => {
        const server = await (0, bookingCreatorSettlementOperationalFixtures_1.startOperationalHttpServer)();
        const model = auditLog_model_1.AuditLog;
        const original = model.create;
        try {
            const fixture = await (0, bookingCreatorSettlementOperationalFixtures_1.createSettledOperationalFixture)(server.baseUrl);
            await auditLog_model_1.AuditLog.deleteOne({
                action: auditAction_enum_1.AuditAction.BOOKING_CREATOR_WALLET_SETTLED,
                entityId: fixture.settlement._id,
            });
            const reconciliation = await bookingCreatorSettlementReconciliation_service_1.bookingCreatorSettlementReconciliationService.reconcile(fixture.settlement.settlementReference);
            const walletBefore = await wallet_model_1.Wallet.findById(fixture.creatorWallet._id).orFail();
            let auditCreateCount = 0;
            model.create = (async (...args) => {
                auditCreateCount += 1;
                if (auditCreateCount === 2) {
                    throw new Error("controlled repair operational-audit failure");
                }
                return original.apply(model, args);
            });
            await strict_1.default.rejects(bookingCreatorSettlementRepair_service_1.bookingCreatorSettlementRepairService.repair(reconciliation.reconciliationReference, bookingCreatorSettlementReconciliation_enum_1.BookingCreatorSettlementRepairAction.RESTORE_MISSING_AUDIT, fixture.fixture.actors.adminId.toString()));
            strict_1.default.equal(await bookingCreatorSettlementRepairOperation_model_1.BookingCreatorSettlementRepairOperation.countDocuments(), 0);
            strict_1.default.equal(await auditLog_model_1.AuditLog.countDocuments({
                action: auditAction_enum_1.AuditAction.BOOKING_CREATOR_WALLET_SETTLED,
                entityId: fixture.settlement._id,
            }), 0);
            const walletAfter = await wallet_model_1.Wallet.findById(fixture.creatorWallet._id).orFail();
            strict_1.default.equal(walletAfter.currentBalance, walletBefore.currentBalance);
            strict_1.default.equal(walletAfter.projectionVersion, walletBefore.projectionVersion);
        }
        finally {
            model.create = original;
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8f operational audit actions are bounded and use safe references", async () => {
        const server = await (0, bookingCreatorSettlementOperationalFixtures_1.startOperationalHttpServer)();
        try {
            const fixture = await (0, bookingCreatorSettlementOperationalFixtures_1.createSettledOperationalFixture)(server.baseUrl);
            await bookingCreatorSettlementReconciliation_service_1.bookingCreatorSettlementReconciliationService.reconcile(fixture.settlement.settlementReference);
            const audit = await auditLog_model_1.AuditLog.findOne({
                action: auditAction_enum_1.AuditAction.BOOKING_CREATOR_SETTLEMENT_RECONCILED,
            }).orFail();
            strict_1.default.equal(audit.actorType, "SYSTEM");
            strict_1.default.equal(audit.financialContext?.domain, "BOOKING_WALLET");
            strict_1.default.equal(audit.financialContext?.settlementReference, fixture.settlement.settlementReference);
            strict_1.default.equal(JSON.stringify(audit).includes("settlementFingerprint"), false);
        }
        finally {
            await server.close();
        }
    });
};
exports.registerBookingCreatorSettlementOperationalAuditTests = registerBookingCreatorSettlementOperationalAuditTests;
