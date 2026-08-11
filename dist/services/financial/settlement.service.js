"use strict";
// backend/src/services/financial/settlement.service.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.settlementService = exports.SettlementService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const settlement_repository_1 = require("../../repositories/settlement.repository");
const money_util_1 = require("../../utils/financial/money.util");
const reference_util_1 = require("../../utils/financial/reference.util");
const idempotency_util_1 = require("../../utils/financial/idempotency.util");
const SettlementError_1 = require("../../errors/financial/SettlementError");
const settlementStatus_enum_1 = require("../../enums/financial/settlementStatus.enum");
const paymentProvider_enum_1 = require("../../enums/financial/paymentProvider.enum");
class SettlementService {
    constructor(repository = settlement_repository_1.settlementRepository) {
        this.repository = repository;
    }
    /* -------------------------------------------------------------------------- */
    /* Helpers                                                                     */
    /* -------------------------------------------------------------------------- */
    validateObjectId(value, field) {
        if (!mongoose_1.default.Types.ObjectId.isValid(value)) {
            throw new SettlementError_1.SettlementError(`Invalid ${field}.`);
        }
    }
    validateMoney(money) {
        if (!(0, money_util_1.isValidMoney)(money)) {
            throw new SettlementError_1.SettlementError("Invalid settlement amount.");
        }
    }
    async getSettlementDocument(settlementId, session) {
        this.validateObjectId(settlementId, "settlement id");
        const settlement = await this.repository.findById(settlementId);
        if (!settlement) {
            throw new SettlementError_1.SettlementError("Settlement not found.");
        }
        return settlement;
    }
    async save(settlement, update, session) {
        const updated = await this.repository.updateById(settlement._id.toString(), update, session);
        if (!updated) {
            throw new SettlementError_1.SettlementError("Failed to update settlement.");
        }
        return updated;
    }
    /* -------------------------------------------------------------------------- */
    /* Creation                                                                    */
    /* -------------------------------------------------------------------------- */
    async createSettlement(input) {
        this.validateObjectId(input.bookingId, "booking id");
        this.validateObjectId(input.paymentId, "payment id");
        this.validateObjectId(input.userId, "user id");
        this.validateObjectId(input.creatorId, "creator id");
        this.validateMoney(input.amount);
        return this.repository.create({
            settlementReference: (0, reference_util_1.generateFinancialReference)("SETTLEMENT"),
            bookingId: new mongoose_1.default.Types.ObjectId(input.bookingId),
            paymentId: new mongoose_1.default.Types.ObjectId(input.paymentId),
            userId: new mongoose_1.default.Types.ObjectId(input.userId),
            creatorId: new mongoose_1.default.Types.ObjectId(input.creatorId),
            amount: input.amount.amount,
            currency: input.amount.currency,
            status: settlementStatus_enum_1.SettlementStatus.CREATED,
            provider: input.provider ?? paymentProvider_enum_1.PaymentProvider.INTERNAL,
            providerSettlementId: input.providerSettlementId,
            providerBatchId: input.providerBatchId,
            providerTransactionId: input.providerTransactionId,
            attemptNumber: 1,
            retryable: true,
            idempotencyKey: input.idempotencyKey ?? (0, idempotency_util_1.generateIdempotencyKey)(),
            // Future Phase 5 settlement execution uses this canonical obligation
            // identity. It is partial-indexed so legacy incomplete records remain
            // deployable and reconciliation can classify them conservatively.
            financialObligationKey: `settlement-obligation:${input.bookingId}:${input.paymentId}`,
            providerPayload: input.providerPayload ?? {},
            attributes: input.attributes ?? {},
        });
    }
    /* -------------------------------------------------------------------------- */
    /* Reads                                                                       */
    /* -------------------------------------------------------------------------- */
    async getSettlement(settlementId) {
        return this.getSettlementDocument(settlementId);
    }
    async getByReference(settlementReference) {
        const settlement = await this.repository.findBySettlementReference(settlementReference);
        if (!settlement) {
            throw new SettlementError_1.SettlementError("Settlement not found.");
        }
        return settlement;
    }
    async getByBooking(bookingId) {
        this.validateObjectId(bookingId, "booking id");
        return this.repository.findByBookingId(bookingId);
    }
    async getByPayment(paymentId, session) {
        this.validateObjectId(paymentId, "payment id");
        return this.repository.findByPaymentId(paymentId, session);
    }
    async getByUser(userId) {
        this.validateObjectId(userId, "user id");
        return this.repository.findByUserId(userId);
    }
    async getByCreator(creatorId) {
        this.validateObjectId(creatorId, "creator id");
        return this.repository.findByCreatorId(creatorId);
    }
    /* -------------------------------------------------------------------------- */
    /* Status                                                                      */
    /* -------------------------------------------------------------------------- */
    async updateStatus(settlementId, status) {
        const settlement = await this.getSettlementDocument(settlementId);
        return this.save(settlement, {
            status,
        });
    }
    async markProcessing(settlementId) {
        const settlement = await this.getSettlementDocument(settlementId);
        return this.save(settlement, {
            status: settlementStatus_enum_1.SettlementStatus.PROCESSING,
        });
    }
    async markCompleted(settlementId) {
        const settlement = await this.getSettlementDocument(settlementId);
        return this.save(settlement, {
            status: settlementStatus_enum_1.SettlementStatus.COMPLETED,
            settledAt: new Date(),
        });
    }
    /* -------------------------------------------------------------------------- */
    /* Failure                                                                     */
    /* -------------------------------------------------------------------------- */
    async markFailed(settlementId, message) {
        const settlement = await this.getSettlementDocument(settlementId);
        return this.save(settlement, {
            status: settlementStatus_enum_1.SettlementStatus.FAILED,
            failureMessage: message,
            attemptNumber: settlement.attemptNumber + 1,
        });
    }
    async markCancelled(settlementId) {
        const settlement = await this.getSettlementDocument(settlementId);
        return this.save(settlement, {
            status: settlementStatus_enum_1.SettlementStatus.CANCELLED,
        });
    }
    /* -------------------------------------------------------------------------- */
    /* Provider                                                                    */
    /* -------------------------------------------------------------------------- */
    async updateProviderReferences(settlementId, data) {
        const settlement = await this.getSettlementDocument(settlementId);
        return this.save(settlement, {
            ...data,
        });
    }
    async updateProviderPayload(settlementId, payload) {
        const settlement = await this.getSettlementDocument(settlementId);
        return this.save(settlement, {
            providerPayload: payload,
        });
    }
    async updateAttributes(settlementId, attributes, session) {
        const settlement = await this.getSettlementDocument(settlementId, session);
        return this.save(settlement, {
            attributes,
        }, session);
    }
    async setRetryable(settlementId, retryable) {
        const settlement = await this.getSettlementDocument(settlementId);
        return this.save(settlement, {
            retryable,
        });
    }
    /* -------------------------------------------------------------------------- */
    /* Validation                                                                  */
    /* -------------------------------------------------------------------------- */
    async exists(settlementId) {
        this.validateObjectId(settlementId, "settlement id");
        return this.repository.exists({
            _id: new mongoose_1.default.Types.ObjectId(settlementId),
        });
    }
    async existsByReference(settlementReference) {
        return this.repository.exists({
            settlementReference,
        });
    }
    async findByIdempotencyKey(idempotencyKey) {
        return this.repository.findByIdempotencyKey(idempotencyKey);
    }
    async verifyIntegrity(settlementId) {
        const settlement = await this.getSettlementDocument(settlementId);
        return (settlement.amount > 0 &&
            settlement.settlementReference.length > 0 &&
            settlement.currency.length > 0 &&
            settlement.idempotencyKey.length > 0);
    }
    /* -------------------------------------------------------------------------- */
    /* Generic Repository Helpers                                                  */
    /* -------------------------------------------------------------------------- */
    async findOne(filter) {
        return this.repository.findOne(filter);
    }
    async findMany(filter) {
        return this.repository.findMany(filter);
    }
    async update(settlementId, update) {
        const settlement = await this.getSettlementDocument(settlementId);
        return this.save(settlement, update);
    }
    async deleteSettlement(settlementId) {
        const settlement = await this.getSettlementDocument(settlementId);
        const deleted = await this.repository.deleteById(settlement._id.toString());
        if (!deleted) {
            throw new SettlementError_1.SettlementError("Failed to delete settlement.");
        }
        return deleted;
    }
}
exports.SettlementService = SettlementService;
exports.settlementService = new SettlementService();
