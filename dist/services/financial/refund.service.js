"use strict";
// backend/src/services/financial/refund.service.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.refundService = exports.RefundService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const refund_repository_1 = require("../../repositories/refund.repository");
const money_util_1 = require("../../utils/financial/money.util");
const reference_util_1 = require("../../utils/financial/reference.util");
const idempotency_util_1 = require("../../utils/financial/idempotency.util");
const RefundError_1 = require("../../errors/financial/RefundError");
const refundStatus_enum_1 = require("../../enums/financial/refundStatus.enum");
const refundReason_enum_1 = require("../../enums/financial/refundReason.enum");
const paymentProvider_enum_1 = require("../../enums/financial/paymentProvider.enum");
class RefundService {
    constructor(repository = refund_repository_1.refundRepository) {
        this.repository = repository;
    }
    /* -------------------------------------------------------------------------- */
    /* Helpers                                                                     */
    /* -------------------------------------------------------------------------- */
    validateObjectId(value, field) {
        if (!mongoose_1.default.Types.ObjectId.isValid(value)) {
            throw new RefundError_1.RefundError(`Invalid ${field}.`);
        }
    }
    validateMoney(money) {
        if (!(0, money_util_1.isValidMoney)(money)) {
            throw new RefundError_1.RefundError("Invalid refund amount.");
        }
    }
    async getRefundDocument(refundId) {
        this.validateObjectId(refundId, "refund id");
        const refund = await this.repository.findById(refundId);
        if (!refund) {
            throw new RefundError_1.RefundError("Refund not found.");
        }
        return refund;
    }
    async save(refund, update) {
        const updated = await this.repository.updateById(refund._id.toString(), update);
        if (!updated) {
            throw new RefundError_1.RefundError("Failed to update refund.");
        }
        return updated;
    }
    /* -------------------------------------------------------------------------- */
    /* Creation                                                                    */
    /* -------------------------------------------------------------------------- */
    async createRefund(input) {
        this.validateObjectId(input.paymentId, "payment id");
        this.validateObjectId(input.bookingId, "booking id");
        this.validateObjectId(input.userId, "user id");
        this.validateObjectId(input.creatorId, "creator id");
        this.validateMoney(input.amount);
        return this.repository.create({
            refundReference: (0, reference_util_1.generateFinancialReference)("REFUND"),
            paymentId: new mongoose_1.default.Types.ObjectId(input.paymentId),
            bookingId: new mongoose_1.default.Types.ObjectId(input.bookingId),
            userId: new mongoose_1.default.Types.ObjectId(input.userId),
            creatorId: new mongoose_1.default.Types.ObjectId(input.creatorId),
            amount: input.amount.amount,
            currency: input.amount.currency,
            status: refundStatus_enum_1.RefundStatus.CREATED,
            reason: input.reason ?? refundReason_enum_1.RefundReason.OTHER,
            provider: input.provider ?? paymentProvider_enum_1.PaymentProvider.INTERNAL,
            providerRefundId: input.providerRefundId,
            providerPaymentId: input.providerPaymentId,
            settlementId: input.settlementId,
            attemptNumber: 1,
            retryable: true,
            idempotencyKey: input.idempotencyKey ?? (0, idempotency_util_1.generateIdempotencyKey)(),
            providerPayload: input.providerPayload ?? {},
            attributes: input.attributes ?? {},
        });
    }
    /* -------------------------------------------------------------------------- */
    /* Reads                                                                       */
    /* -------------------------------------------------------------------------- */
    async getRefund(refundId) {
        return this.getRefundDocument(refundId);
    }
    async getByReference(refundReference) {
        const refund = await this.repository.findByRefundReference(refundReference);
        if (!refund) {
            throw new RefundError_1.RefundError("Refund not found.");
        }
        return refund;
    }
    async getByPayment(paymentId) {
        this.validateObjectId(paymentId, "payment id");
        return this.repository.findByPaymentId(paymentId);
    }
    async getByBooking(bookingId) {
        this.validateObjectId(bookingId, "booking id");
        return this.repository.findByBookingId(bookingId);
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
    async updateStatus(refundId, status) {
        const refund = await this.getRefundDocument(refundId);
        return this.save(refund, {
            status,
        });
    }
    async markProcessing(refundId) {
        const refund = await this.getRefundDocument(refundId);
        return this.save(refund, {
            status: refundStatus_enum_1.RefundStatus.PROCESSING,
        });
    }
    async markCompleted(refundId, providerRefundId) {
        const refund = await this.getRefundDocument(refundId);
        return this.save(refund, {
            status: refundStatus_enum_1.RefundStatus.COMPLETED,
            providerRefundId,
        });
    }
    /* -------------------------------------------------------------------------- */
    /* Failure                                                                     */
    /* -------------------------------------------------------------------------- */
    async markFailed(refundId, message) {
        const refund = await this.getRefundDocument(refundId);
        return this.save(refund, {
            status: refundStatus_enum_1.RefundStatus.FAILED,
            failureMessage: message,
            attemptNumber: refund.attemptNumber + 1,
        });
    }
    async markCancelled(refundId) {
        const refund = await this.getRefundDocument(refundId);
        return this.save(refund, {
            status: refundStatus_enum_1.RefundStatus.CANCELLED,
        });
    }
    /* -------------------------------------------------------------------------- */
    /* Provider                                                                    */
    /* -------------------------------------------------------------------------- */
    async updateProviderReferences(refundId, data) {
        const refund = await this.getRefundDocument(refundId);
        return this.save(refund, {
            ...data,
        });
    }
    async updateProviderPayload(refundId, payload) {
        const refund = await this.getRefundDocument(refundId);
        return this.save(refund, {
            providerPayload: payload,
        });
    }
    async updateAttributes(refundId, attributes) {
        const refund = await this.getRefundDocument(refundId);
        return this.save(refund, {
            attributes,
        });
    }
    async setRetryable(refundId, retryable) {
        const refund = await this.getRefundDocument(refundId);
        return this.save(refund, {
            retryable,
        });
    }
    /* -------------------------------------------------------------------------- */
    /* Validation                                                                  */
    /* -------------------------------------------------------------------------- */
    async exists(refundId) {
        this.validateObjectId(refundId, "refund id");
        return this.repository.exists({
            _id: new mongoose_1.default.Types.ObjectId(refundId),
        });
    }
    async existsByReference(refundReference) {
        return this.repository.exists({
            refundReference,
        });
    }
    async findByIdempotencyKey(idempotencyKey) {
        return this.repository.findByIdempotencyKey(idempotencyKey);
    }
    async verifyIntegrity(refundId) {
        const refund = await this.getRefundDocument(refundId);
        return (refund.amount > 0 &&
            refund.refundReference.length > 0 &&
            refund.currency.length > 0 &&
            refund.idempotencyKey.length > 0);
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
    async update(refundId, update) {
        const refund = await this.getRefundDocument(refundId);
        return this.save(refund, update);
    }
    async deleteRefund(refundId) {
        const refund = await this.getRefundDocument(refundId);
        const deleted = await this.repository.deleteById(refund._id.toString());
        if (!deleted) {
            throw new RefundError_1.RefundError("Failed to delete refund.");
        }
        return deleted;
    }
}
exports.RefundService = RefundService;
exports.refundService = new RefundService();
