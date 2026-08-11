"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletTopUpRetryAttemptRepository = exports.WalletTopUpRetryAttemptRepository = void 0;
const walletTopUpRetryAttempt_model_1 = require("../models/walletTopUpRetryAttempt.model");
class WalletTopUpRetryAttemptRepository {
    create(input) {
        return walletTopUpRetryAttempt_model_1.WalletTopUpRetryAttempt.create({ ...input, actorType: "ADMIN" });
    }
    complete(operationKey, input) {
        return walletTopUpRetryAttempt_model_1.WalletTopUpRetryAttempt.findOneAndUpdate({ operationKey, completedAt: { $exists: false } }, { $set: input }, { new: true, runValidators: true }).exec();
    }
}
exports.WalletTopUpRetryAttemptRepository = WalletTopUpRetryAttemptRepository;
exports.walletTopUpRetryAttemptRepository = new WalletTopUpRetryAttemptRepository();
