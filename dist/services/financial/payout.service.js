"use strict";
// backend/src/services/financial/payout.service.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.payoutService = exports.PayoutService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const payout_repository_1 = require("../../repositories/payout.repository");
const money_util_1 = require("../../utils/financial/money.util");
const reference_util_1 = require("../../utils/financial/reference.util");
const idempotency_util_1 = require("../../utils/financial/idempotency.util");
const PayoutError_1 = require("../../errors/financial/PayoutError");
const payoutStatus_enum_1 = require("../../enums/financial/payoutStatus.enum");
const payoutSourceType_enum_1 = require("../../enums/financial/payoutSourceType.enum");
const paymentProvider_enum_1 = require("../../enums/financial/paymentProvider.enum");
class PayoutService {
    constructor(repository = payout_repository_1.payoutRepository) {
        this.repository = repository;
    }
    /* -------------------------------------------------------------------------- */
    /* Helpers                                                                     */
    /* -------------------------------------------------------------------------- */
    validateObjectId(value, field) {
        if (!mongoose_1.default.Types.ObjectId.isValid(value)) {
            throw new PayoutError_1.PayoutError(`Invalid ${field}.`);
        }
    }
    validateMoney(money) {
        if (!(0, money_util_1.isValidMoney)(money)) {
            throw new PayoutError_1.PayoutError("Invalid payout amount.");
        }
    }
    async getPayoutDocument(payoutId) {
        this.validateObjectId(payoutId, "payout id");
        const payout = await this.repository.findById(payoutId);
        if (!payout) {
            throw new PayoutError_1.PayoutError("Payout not found.");
        }
        return payout;
    }
    async save(payout, update) {
        const updated = await this.repository.updateById(payout._id.toString(), update);
        if (!updated) {
            throw new PayoutError_1.PayoutError("Failed to update payout.");
        }
        return updated;
    }
    /* -------------------------------------------------------------------------- */
    /* Creation                                                                    */
    /* -------------------------------------------------------------------------- */
    async createPayout(input) {
        this.validateObjectId(input.creatorId, "creator id");
        this.validateObjectId(input.settlementId, "settlement id");
        this.validateObjectId(input.bookingId, "booking id");
        this.validateObjectId(input.paymentId, "payment id");
        this.validateMoney(input.amount);
        return this.repository.create({
            payoutReference: (0, reference_util_1.generateFinancialReference)("PAYOUT"),
            creatorId: new mongoose_1.default.Types.ObjectId(input.creatorId),
            settlementId: new mongoose_1.default.Types.ObjectId(input.settlementId),
            bookingId: new mongoose_1.default.Types.ObjectId(input.bookingId),
            paymentId: new mongoose_1.default.Types.ObjectId(input.paymentId),
            amount: input.amount.amount,
            currency: input.amount.currency,
            status: payoutStatus_enum_1.PayoutStatus.CREATED,
            provider: input.provider ?? paymentProvider_enum_1.PaymentProvider.INTERNAL,
            providerPayoutId: input.providerPayoutId,
            providerTransferId: input.providerTransferId,
            beneficiaryId: input.beneficiaryId,
            attemptNumber: 1,
            retryable: true,
            idempotencyKey: input.idempotencyKey ?? (0, idempotency_util_1.generateIdempotencyKey)(),
            providerPayload: input.providerPayload ?? {},
            attributes: input.attributes ?? {},
            initiatedAt: new Date(),
        });
    }
    async createWithdrawalPayout(input, session) {
        this.validateObjectId(input.withdrawalId, "withdrawal id");
        this.validateObjectId(input.creatorId, "creator id");
        this.validateMoney(input.amount);
        return this.repository.create({
            payoutReference: (0, reference_util_1.generateFinancialReference)("PAYOUT"),
            sourceType: payoutSourceType_enum_1.PayoutSourceType.WITHDRAWAL,
            withdrawalId: new mongoose_1.default.Types.ObjectId(input.withdrawalId),
            creatorId: new mongoose_1.default.Types.ObjectId(input.creatorId),
            amount: input.amount.amount,
            currency: input.amount.currency,
            status: payoutStatus_enum_1.PayoutStatus.CREATED,
            provider: paymentProvider_enum_1.PaymentProvider.INTERNAL,
            attemptNumber: 1,
            retryable: true,
            idempotencyKey: input.idempotencyKey,
            providerPayload: {},
            attributes: {},
            initiatedAt: new Date(),
        }, session);
    }
    async getByWithdrawal(withdrawalId, session) {
        this.validateObjectId(withdrawalId, "withdrawal id");
        return this.repository.findByWithdrawalId(withdrawalId, session);
    }
    /* -------------------------------------------------------------------------- */
    /* Reads                                                                       */
    /* -------------------------------------------------------------------------- */
    async getPayout(payoutId) {
        return this.getPayoutDocument(payoutId);
    }
    async getByReference(payoutReference) {
        const payout = await this.repository.findByPayoutReference(payoutReference);
        if (!payout) {
            throw new PayoutError_1.PayoutError("Payout not found.");
        }
        return payout;
    }
    async getByCreator(creatorId) {
        this.validateObjectId(creatorId, "creator id");
        return this.repository.findByCreatorId(creatorId);
    }
    async getBySettlement(settlementId) {
        this.validateObjectId(settlementId, "settlement id");
        return this.repository.findBySettlementId(settlementId);
    }
    async getByBooking(bookingId) {
        this.validateObjectId(bookingId, "booking id");
        return this.repository.findByBookingId(bookingId);
    }
    async getByPayment(paymentId) {
        this.validateObjectId(paymentId, "payment id");
        return this.repository.findByPaymentId(paymentId);
    }
    /* -------------------------------------------------------------------------- */
    /* Status                                                                      */
    /* -------------------------------------------------------------------------- */
    async updateStatus(payoutId, status) {
        const payout = await this.getPayoutDocument(payoutId);
        return this.save(payout, {
            status,
        });
    }
    async markProcessing(payoutId) {
        const payout = await this.getPayoutDocument(payoutId);
        return this.save(payout, {
            status: payoutStatus_enum_1.PayoutStatus.PROCESSING,
        });
    }
    async markCompleted(payoutId) {
        const payout = await this.getPayoutDocument(payoutId);
        return this.save(payout, {
            status: payoutStatus_enum_1.PayoutStatus.COMPLETED,
            completedAt: new Date(),
        });
    }
    /* -------------------------------------------------------------------------- */
    /* Failure                                                                     */
    /* -------------------------------------------------------------------------- */
    async markFailed(payoutId, message) {
        const payout = await this.getPayoutDocument(payoutId);
        return this.save(payout, {
            status: payoutStatus_enum_1.PayoutStatus.FAILED,
            failureMessage: message,
            attemptNumber: payout.attemptNumber + 1,
        });
    }
    async markCancelled(payoutId) {
        const payout = await this.getPayoutDocument(payoutId);
        return this.save(payout, {
            status: payoutStatus_enum_1.PayoutStatus.CANCELLED,
        });
    }
    /* -------------------------------------------------------------------------- */
    /* Provider                                                                    */
    /* -------------------------------------------------------------------------- */
    async updateProviderReferences(payoutId, data) {
        const payout = await this.getPayoutDocument(payoutId);
        return this.save(payout, {
            ...data,
        });
    }
    async updateProviderPayload(payoutId, payload) {
        const payout = await this.getPayoutDocument(payoutId);
        return this.save(payout, {
            providerPayload: payload,
        });
    }
    async updateAttributes(payoutId, attributes) {
        const payout = await this.getPayoutDocument(payoutId);
        return this.save(payout, {
            attributes,
        });
    }
    async setRetryable(payoutId, retryable) {
        const payout = await this.getPayoutDocument(payoutId);
        return this.save(payout, {
            retryable,
        });
    }
    /* -------------------------------------------------------------------------- */
    /* Validation                                                                  */
    /* -------------------------------------------------------------------------- */
    async exists(payoutId) {
        this.validateObjectId(payoutId, "payout id");
        return this.repository.exists({
            _id: new mongoose_1.default.Types.ObjectId(payoutId),
        });
    }
    async existsByReference(payoutReference) {
        return this.repository.exists({
            payoutReference,
        });
    }
    async findByIdempotencyKey(idempotencyKey) {
        return this.repository.findByIdempotencyKey(idempotencyKey);
    }
    async verifyIntegrity(payoutId) {
        const payout = await this.getPayoutDocument(payoutId);
        return (payout.amount > 0 &&
            payout.payoutReference.length > 0 &&
            payout.currency.length > 0 &&
            payout.idempotencyKey.length > 0);
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
    async update(payoutId, update) {
        const payout = await this.getPayoutDocument(payoutId);
        return this.save(payout, update);
    }
    async deletePayout(payoutId) {
        const payout = await this.getPayoutDocument(payoutId);
        const deleted = await this.repository.deleteById(payout._id.toString());
        if (!deleted) {
            throw new PayoutError_1.PayoutError("Failed to delete payout.");
        }
        return deleted;
    }
}
exports.PayoutService = PayoutService;
exports.payoutService = new PayoutService();
