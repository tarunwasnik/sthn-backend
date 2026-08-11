"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletConversionRetryAttemptRepository = exports.WalletConversionRetryAttemptRepository = void 0;
const walletConversionRetryAttempt_model_1 = require("../models/walletConversionRetryAttempt.model");
class WalletConversionRetryAttemptRepository {
    findByKey(key, session) {
        return walletConversionRetryAttempt_model_1.WalletConversionRetryAttempt.findOne({ attemptKey: key })
            .select("+attemptKey +performedBy").session(session ?? null).exec();
    }
    create(data, session) {
        return walletConversionRetryAttempt_model_1.WalletConversionRetryAttempt.create([data], { session })
            .then(([created]) => created);
    }
}
exports.WalletConversionRetryAttemptRepository = WalletConversionRetryAttemptRepository;
exports.walletConversionRetryAttemptRepository = new WalletConversionRetryAttemptRepository();
