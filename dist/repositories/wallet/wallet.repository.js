"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletRepository = exports.WalletRepository = void 0;
const WalletError_1 = require("../../errors/financial/WalletError");
const wallet_model_1 = require("../../models/wallet.model");
class WalletRepository {
    async findById(walletId, session) {
        return wallet_model_1.Wallet.findById(walletId).session(session ?? null);
    }
    async findByUserAndCurrency(userId, currency, session) {
        const wallets = await wallet_model_1.Wallet.find({ userId, currency })
            .limit(2)
            .session(session ?? null)
            .exec();
        if (wallets.length > 1) {
            throw new WalletError_1.WalletError("Multiple Wallets exist for the same ownership identity.", "WALLET_DUPLICATE_OWNERSHIP");
        }
        return wallets[0] ?? null;
    }
    async findAllByUser(userId) {
        return wallet_model_1.Wallet.find({ userId }).sort({ currency: 1 }).exec();
    }
    async findAnyByUser(userId, session) {
        return wallet_model_1.Wallet.findOne({ userId }).session(session ?? null).exec();
    }
    async exists(userId, currency) {
        return (await wallet_model_1.Wallet.exists({ userId, currency })) !== null;
    }
    async createZeroBalance(userId, currency, session) {
        const data = { userId, currency };
        if (!session)
            return wallet_model_1.Wallet.create(data);
        const [wallet] = await wallet_model_1.Wallet.create([data], { session });
        return wallet;
    }
    async applyConditionalDelta(walletId, minimums, maximums, maximumCurrentBalance, update, session) {
        const filter = {
            _id: walletId,
            $expr: {
                $eq: [
                    "$currentBalance",
                    { $add: ["$availableBalance", "$reservedBalance", "$lockedBalance"] },
                ],
            },
        };
        for (const field of ["availableBalance", "reservedBalance", "lockedBalance"]) {
            const minimum = minimums[field];
            const maximum = maximums[field];
            if (minimum !== undefined || maximum !== undefined) {
                filter[field] = {
                    ...(minimum !== undefined ? { $gte: minimum } : {}),
                    ...(maximum !== undefined ? { $lte: maximum } : {}),
                };
            }
        }
        if (maximumCurrentBalance !== undefined)
            filter.currentBalance = { $lte: maximumCurrentBalance };
        return wallet_model_1.Wallet.findOneAndUpdate(filter, update, {
            new: true,
            runValidators: true,
            session,
        });
    }
    async markSynchronized(walletId, at, session) {
        return wallet_model_1.Wallet.findByIdAndUpdate(walletId, { lastSyncedAt: at }, {
            new: true,
            runValidators: true,
            session,
        });
    }
}
exports.WalletRepository = WalletRepository;
exports.walletRepository = new WalletRepository();
