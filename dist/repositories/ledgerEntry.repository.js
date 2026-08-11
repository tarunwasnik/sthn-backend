"use strict";
// backend/src/repositories/ledgerEntry.repository.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.ledgerEntryRepository = exports.LedgerEntryRepository = void 0;
const ledgerEntry_model_1 = require("../models/ledgerEntry.model");
class LedgerEntryRepository {
    async findByPostingKey(postingKey, session) {
        return ledgerEntry_model_1.LedgerEntry.findOne({ postingKey }).session(session ?? null).exec();
    }
    async create(data, session) {
        if (!session) {
            return ledgerEntry_model_1.LedgerEntry.create(data);
        }
        const [entry] = await ledgerEntry_model_1.LedgerEntry.create([data], { session });
        return entry;
    }
    async createMany(entries) {
        const created = await ledgerEntry_model_1.LedgerEntry.insertMany(entries);
        return created;
    }
    async findById(id) {
        return ledgerEntry_model_1.LedgerEntry.findById(id).exec();
    }
    async findByLedgerReference(ledgerReference) {
        return ledgerEntry_model_1.LedgerEntry.findOne({ ledgerReference }).exec();
    }
    async findByBookingId(bookingId) {
        return ledgerEntry_model_1.LedgerEntry.find({ bookingId }).sort({ createdAt: -1 }).exec();
    }
    async findByPaymentId(paymentId) {
        return ledgerEntry_model_1.LedgerEntry.find({ paymentId }).sort({ createdAt: -1 }).exec();
    }
    async findByRefundId(refundId) {
        return ledgerEntry_model_1.LedgerEntry.find({ refundId }).sort({ createdAt: -1 }).exec();
    }
    async findBySettlementId(settlementId) {
        return ledgerEntry_model_1.LedgerEntry.find({ settlementId }).sort({ createdAt: -1 }).exec();
    }
    async findByPayoutId(payoutId) {
        return ledgerEntry_model_1.LedgerEntry.find({ payoutId }).sort({ createdAt: -1 }).exec();
    }
    async findByUserId(userId) {
        return ledgerEntry_model_1.LedgerEntry.find({ userId }).sort({ createdAt: -1 }).exec();
    }
    async findOne(filter) {
        return ledgerEntry_model_1.LedgerEntry.findOne(filter).exec();
    }
    async findMany(filter, session) {
        return ledgerEntry_model_1.LedgerEntry.find(filter).sort({ createdAt: -1 })
            .session(session ?? null).exec();
    }
    async findManyWithPostingKeys(filter, session) {
        return ledgerEntry_model_1.LedgerEntry.find(filter).select("+postingKey").sort({ createdAt: -1 })
            .session(session ?? null).exec();
    }
    async updateById(id, update) {
        return ledgerEntry_model_1.LedgerEntry.findByIdAndUpdate(id, update, {
            new: true,
            runValidators: true,
        }).exec();
    }
    async updateOne(filter, update) {
        return ledgerEntry_model_1.LedgerEntry.findOneAndUpdate(filter, update, {
            new: true,
            runValidators: true,
        }).exec();
    }
    async exists(filter, session) {
        const result = await ledgerEntry_model_1.LedgerEntry.exists(filter).session(session ?? null);
        return result !== null;
    }
    async count(filter = {}) {
        return ledgerEntry_model_1.LedgerEntry.countDocuments(filter).exec();
    }
}
exports.LedgerEntryRepository = LedgerEntryRepository;
exports.ledgerEntryRepository = new LedgerEntryRepository();
