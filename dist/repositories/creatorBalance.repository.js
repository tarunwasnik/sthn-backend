"use strict";
// backend/src/repositories/creatorBalance.repository.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.creatorBalanceRepository = exports.CreatorBalanceRepository = void 0;
const creatorBalance_model_1 = require("../models/creatorBalance.model");
class CreatorBalanceRepository {
    async create(data, session) {
        if (!session) {
            return creatorBalance_model_1.CreatorBalance.create(data);
        }
        const [balance] = await creatorBalance_model_1.CreatorBalance.create([data], { session });
        return balance;
    }
    async findById(id) {
        return creatorBalance_model_1.CreatorBalance.findById(id).exec();
    }
    async findByCreatorId(creatorId, session) {
        return creatorBalance_model_1.CreatorBalance.findOne({
            creatorId,
        })
            .session(session ?? null)
            .exec();
    }
    async findOne(filter) {
        return creatorBalance_model_1.CreatorBalance.findOne(filter).exec();
    }
    async findMany(filter) {
        return creatorBalance_model_1.CreatorBalance.find(filter).sort({ createdAt: -1 }).exec();
    }
    async updateById(id, update, session) {
        return creatorBalance_model_1.CreatorBalance.findByIdAndUpdate(id, update, {
            new: true,
            runValidators: true,
            session,
        }).exec();
    }
    async reserveAvailableBalance(creatorId, currency, amount, session) {
        return creatorBalance_model_1.CreatorBalance.findOneAndUpdate({
            creatorId,
            currency,
            availableBalance: { $gte: amount },
        }, {
            $inc: {
                availableBalance: -amount,
                reservedBalance: amount,
            },
            $set: {
                lastCalculatedAt: new Date(),
            },
        }, {
            new: true,
            runValidators: true,
            session,
        }).exec();
    }
    async consumeReservedBalance(creatorId, currency, amount, session) {
        return creatorBalance_model_1.CreatorBalance.findOneAndUpdate({ creatorId, currency, reservedBalance: { $gte: amount } }, {
            $inc: { reservedBalance: -amount },
            $set: { lastCalculatedAt: new Date() },
        }, { new: true, runValidators: true, session }).exec();
    }
    async releaseReservedBalance(creatorId, currency, amount, session) {
        return creatorBalance_model_1.CreatorBalance.findOneAndUpdate({ creatorId, currency, reservedBalance: { $gte: amount } }, {
            $inc: {
                reservedBalance: -amount,
                availableBalance: amount,
            },
            $set: { lastCalculatedAt: new Date() },
        }, { new: true, runValidators: true, session }).exec();
    }
    async updateOne(filter, update) {
        return creatorBalance_model_1.CreatorBalance.findOneAndUpdate(filter, update, {
            new: true,
            runValidators: true,
        }).exec();
    }
    async creditAvailableForSettlement(creatorId, currency, amount, session) {
        return creatorBalance_model_1.CreatorBalance.findOneAndUpdate({ creatorId, currency }, { $inc: { availableBalance: amount, lifetimeNet: amount }, $set: { lastCalculatedAt: new Date() } }, { new: true, runValidators: true, session }).exec();
    }
    async exists(filter) {
        const result = await creatorBalance_model_1.CreatorBalance.exists(filter);
        return result !== null;
    }
    async count(filter = {}) {
        return creatorBalance_model_1.CreatorBalance.countDocuments(filter).exec();
    }
    async deleteById(id) {
        return creatorBalance_model_1.CreatorBalance.findByIdAndDelete(id).exec();
    }
}
exports.CreatorBalanceRepository = CreatorBalanceRepository;
exports.creatorBalanceRepository = new CreatorBalanceRepository();
