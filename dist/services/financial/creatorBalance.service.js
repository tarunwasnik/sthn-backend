"use strict";
// backend/src/services/financial/creatorBalance.service.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.creatorBalanceService = exports.CreatorBalanceService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const creatorBalance_repository_1 = require("../../repositories/creatorBalance.repository");
const money_util_1 = require("../../utils/financial/money.util");
const BalanceError_1 = require("../../errors/financial/BalanceError");
class CreatorBalanceService {
    constructor(repository = creatorBalance_repository_1.creatorBalanceRepository) {
        this.repository = repository;
    }
    /* -------------------------------------------------------------------------- */
    /* Helpers                                                                     */
    /* -------------------------------------------------------------------------- */
    validateCreatorId(creatorId) {
        if (!mongoose_1.default.Types.ObjectId.isValid(creatorId)) {
            throw new BalanceError_1.BalanceError("Invalid creator id.");
        }
    }
    validateMoney(money) {
        if (!(0, money_util_1.isValidMoney)(money)) {
            throw new BalanceError_1.BalanceError("Invalid money.");
        }
    }
    ensureCurrency(balance, money) {
        if (balance.currency !== money.currency) {
            throw new BalanceError_1.BalanceError("Currency mismatch.");
        }
    }
    async getBalanceDocument(creatorId, session) {
        this.validateCreatorId(creatorId);
        const balance = await this.repository.findByCreatorId(creatorId, session);
        if (!balance) {
            throw new BalanceError_1.BalanceError("Creator balance not found.");
        }
        return balance;
    }
    async save(balance, update, session) {
        const updated = await this.repository.updateById(balance._id.toString(), update, session);
        if (!updated) {
            throw new BalanceError_1.BalanceError("Failed to update creator balance.");
        }
        return updated;
    }
    /* -------------------------------------------------------------------------- */
    /* Creation                                                                    */
    /* -------------------------------------------------------------------------- */
    async createBalance(input, session) {
        this.validateCreatorId(input.creatorId);
        const existing = await this.repository.findByCreatorId(input.creatorId, session);
        if (existing) {
            return existing;
        }
        return this.repository.create({
            creatorId: new mongoose_1.default.Types.ObjectId(input.creatorId),
            currency: input.currency,
            pendingBalance: 0,
            availableBalance: 0,
            lockedBalance: 0,
            reservedBalance: 0,
            payoutPendingBalance: 0,
            lifetimeGross: 0,
            lifetimeNet: 0,
            lifetimeCommission: 0,
            lifetimeRefunded: 0,
            lifetimePaidOut: 0,
            lastCalculatedAt: new Date(),
        }, session);
    }
    async getBalance(creatorId) {
        return this.getBalanceDocument(creatorId);
    }
    /* -------------------------------------------------------------------------- */
    /* Read Helpers                                                                */
    /* -------------------------------------------------------------------------- */
    async getPendingBalance(creatorId) {
        const balance = await this.getBalanceDocument(creatorId);
        return (0, money_util_1.createMoney)(balance.pendingBalance, balance.currency);
    }
    async getAvailableBalance(creatorId) {
        const balance = await this.getBalanceDocument(creatorId);
        return (0, money_util_1.createMoney)(balance.availableBalance, balance.currency);
    }
    async getLockedBalance(creatorId) {
        const balance = await this.getBalanceDocument(creatorId);
        return (0, money_util_1.createMoney)(balance.lockedBalance, balance.currency);
    }
    async getPayoutPendingBalance(creatorId) {
        const balance = await this.getBalanceDocument(creatorId);
        return (0, money_util_1.createMoney)(balance.payoutPendingBalance, balance.currency);
    }
    /* -------------------------------------------------------------------------- */
    /* Pending Balance                                                             */
    /* -------------------------------------------------------------------------- */
    async increasePendingBalance(input) {
        const balance = await this.getBalanceDocument(input.creatorId);
        this.validateMoney(input.money);
        this.ensureCurrency(balance, input.money);
        return this.save(balance, {
            pendingBalance: balance.pendingBalance + input.money.amount,
            lifetimeGross: balance.lifetimeGross + input.money.amount,
            lastCalculatedAt: new Date(),
        });
    }
    async decreasePendingBalance(input) {
        const balance = await this.getBalanceDocument(input.creatorId);
        this.validateMoney(input.money);
        this.ensureCurrency(balance, input.money);
        if (balance.pendingBalance < input.money.amount) {
            throw new BalanceError_1.BalanceError("Insufficient pending balance.");
        }
        return this.save(balance, {
            pendingBalance: balance.pendingBalance - input.money.amount,
            lastCalculatedAt: new Date(),
        });
    }
    /* -------------------------------------------------------------------------- */
    /* Available Balance                                                           */
    /* -------------------------------------------------------------------------- */
    async increaseAvailableBalance(input) {
        const balance = await this.getBalanceDocument(input.creatorId);
        this.validateMoney(input.money);
        this.ensureCurrency(balance, input.money);
        return this.save(balance, {
            availableBalance: balance.availableBalance + input.money.amount,
            lifetimeNet: balance.lifetimeNet + input.money.amount,
            lastCalculatedAt: new Date(),
        });
    }
    async decreaseAvailableBalance(input) {
        const balance = await this.getBalanceDocument(input.creatorId);
        this.validateMoney(input.money);
        this.ensureCurrency(balance, input.money);
        if (balance.availableBalance < input.money.amount) {
            throw new BalanceError_1.BalanceError("Insufficient available balance.");
        }
        return this.save(balance, {
            availableBalance: balance.availableBalance - input.money.amount,
            lastCalculatedAt: new Date(),
        });
    }
    /* -------------------------------------------------------------------------- */
    /* Locked Balance                                                              */
    /* -------------------------------------------------------------------------- */
    async increaseLockedBalance(input) {
        const balance = await this.getBalanceDocument(input.creatorId);
        this.validateMoney(input.money);
        this.ensureCurrency(balance, input.money);
        return this.save(balance, {
            lockedBalance: balance.lockedBalance + input.money.amount,
            lastCalculatedAt: new Date(),
        });
    }
    async decreaseLockedBalance(input) {
        const balance = await this.getBalanceDocument(input.creatorId);
        this.validateMoney(input.money);
        this.ensureCurrency(balance, input.money);
        if (balance.lockedBalance < input.money.amount) {
            throw new BalanceError_1.BalanceError("Insufficient locked balance.");
        }
        return this.save(balance, {
            lockedBalance: balance.lockedBalance - input.money.amount,
            lastCalculatedAt: new Date(),
        });
    }
    /* -------------------------------------------------------------------------- */
    /* Payout Pending Balance                                                      */
    /* -------------------------------------------------------------------------- */
    async increasePayoutPendingBalance(input) {
        const balance = await this.getBalanceDocument(input.creatorId);
        this.validateMoney(input.money);
        this.ensureCurrency(balance, input.money);
        return this.save(balance, {
            payoutPendingBalance: balance.payoutPendingBalance + input.money.amount,
            lastCalculatedAt: new Date(),
        });
    }
    async decreasePayoutPendingBalance(input) {
        const balance = await this.getBalanceDocument(input.creatorId);
        this.validateMoney(input.money);
        this.ensureCurrency(balance, input.money);
        if (balance.payoutPendingBalance < input.money.amount) {
            throw new BalanceError_1.BalanceError("Insufficient payout pending balance.");
        }
        return this.save(balance, {
            payoutPendingBalance: balance.payoutPendingBalance - input.money.amount,
            lastCalculatedAt: new Date(),
        });
    }
    /* -------------------------------------------------------------------------- */
    /* Lifetime Counters                                                           */
    /* -------------------------------------------------------------------------- */
    async increaseLifetimeCommission(creatorId, money) {
        const balance = await this.getBalanceDocument(creatorId);
        this.validateMoney(money);
        this.ensureCurrency(balance, money);
        return this.save(balance, {
            lifetimeCommission: balance.lifetimeCommission + money.amount,
            lastCalculatedAt: new Date(),
        });
    }
    async increaseLifetimeRefunded(creatorId, money) {
        const balance = await this.getBalanceDocument(creatorId);
        this.validateMoney(money);
        this.ensureCurrency(balance, money);
        return this.save(balance, {
            lifetimeRefunded: balance.lifetimeRefunded + money.amount,
            lastCalculatedAt: new Date(),
        });
    }
    async increaseLifetimePaidOut(creatorId, money) {
        const balance = await this.getBalanceDocument(creatorId);
        this.validateMoney(money);
        this.ensureCurrency(balance, money);
        return this.save(balance, {
            lifetimePaidOut: balance.lifetimePaidOut + money.amount,
            lastCalculatedAt: new Date(),
        });
    }
    /* -------------------------------------------------------------------------- */
    /* Transfers                                                                   */
    /* -------------------------------------------------------------------------- */
    async transferBalance(input, session) {
        const balance = await this.getBalanceDocument(input.creatorId, session);
        this.validateMoney(input.money);
        this.ensureCurrency(balance, input.money);
        const fromValue = balance[input.from];
        if (fromValue < input.money.amount) {
            throw new BalanceError_1.BalanceError(`Insufficient ${input.from}.`);
        }
        return this.save(balance, {
            [input.from]: fromValue - input.money.amount,
            [input.to]: balance[input.to] + input.money.amount,
            lastCalculatedAt: new Date(),
        }, session);
    }
    async reserveAvailableBalance(input, session) {
        this.validateCreatorId(input.creatorId);
        this.validateMoney(input.money);
        const balance = await this.getBalanceDocument(input.creatorId, session);
        this.ensureCurrency(balance, input.money);
        const reserved = await this.repository.reserveAvailableBalance(input.creatorId, input.money.currency, input.money.amount, session);
        if (!reserved) {
            throw new BalanceError_1.BalanceError("Insufficient available balance.");
        }
        return reserved;
    }
    async consumeReservedBalance(input, session) {
        this.validateCreatorId(input.creatorId);
        this.validateMoney(input.money);
        const balance = await this.getBalanceDocument(input.creatorId, session);
        this.ensureCurrency(balance, input.money);
        const updated = await this.repository.consumeReservedBalance(input.creatorId, input.money.currency, input.money.amount, session);
        if (!updated) {
            throw new BalanceError_1.BalanceError("Insufficient locked balance.");
        }
        return updated;
    }
    async releaseReservedBalance(input, session) {
        this.validateCreatorId(input.creatorId);
        this.validateMoney(input.money);
        const balance = await this.getBalanceDocument(input.creatorId, session);
        this.ensureCurrency(balance, input.money);
        const updated = await this.repository.releaseReservedBalance(input.creatorId, input.money.currency, input.money.amount, session);
        if (!updated) {
            throw new BalanceError_1.BalanceError("Insufficient locked balance.");
        }
        return updated;
    }
    /* -------------------------------------------------------------------------- */
    /* Validation                                                                  */
    /* -------------------------------------------------------------------------- */
    async hasBalance(creatorId) {
        this.validateCreatorId(creatorId);
        return this.repository.exists({
            creatorId: new mongoose_1.default.Types.ObjectId(creatorId),
        });
    }
    async verifyIntegrity(creatorId) {
        const balance = await this.getBalanceDocument(creatorId);
        return [
            balance.pendingBalance,
            balance.availableBalance,
            balance.lockedBalance,
            balance.payoutPendingBalance,
            balance.lifetimeGross,
            balance.lifetimeNet,
            balance.lifetimeCommission,
            balance.lifetimeRefunded,
            balance.lifetimePaidOut,
        ].every((value) => Number.isFinite(value) && value >= 0);
    }
    /* -------------------------------------------------------------------------- */
    /* Reset                                                                       */
    /* -------------------------------------------------------------------------- */
    async resetBalances(creatorId) {
        const balance = await this.getBalanceDocument(creatorId);
        return this.save(balance, {
            pendingBalance: 0,
            availableBalance: 0,
            lockedBalance: 0,
            payoutPendingBalance: 0,
            lastCalculatedAt: new Date(),
        });
    }
    /* -------------------------------------------------------------------------- */
    /* Generic Repository Helpers                                                  */
    /* -------------------------------------------------------------------------- */
    async findOne(filter) {
        return this.repository.findOne(filter);
    }
    async update(creatorId, update) {
        const balance = await this.getBalanceDocument(creatorId);
        return this.save(balance, update);
    }
    async deleteBalance(creatorId) {
        const balance = await this.getBalanceDocument(creatorId);
        const deleted = await this.repository.deleteById(balance._id.toString());
        if (!deleted) {
            throw new BalanceError_1.BalanceError("Failed to delete creator balance.");
        }
        return deleted;
    }
}
exports.CreatorBalanceService = CreatorBalanceService;
exports.creatorBalanceService = new CreatorBalanceService();
