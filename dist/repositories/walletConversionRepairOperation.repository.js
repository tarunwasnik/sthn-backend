"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletConversionRepairOperationRepository = exports.WalletConversionRepairOperationRepository = void 0;
const walletConversionRepairOperation_model_1 = require("../models/walletConversionRepairOperation.model");
class WalletConversionRepairOperationRepository {
    findByKey(key, session) {
        return walletConversionRepairOperation_model_1.WalletConversionRepairOperation.findOne({ repairKey: key })
            .select("+repairKey +performedBy").session(session ?? null).exec();
    }
    create(data, session) {
        return walletConversionRepairOperation_model_1.WalletConversionRepairOperation.create([data], { session })
            .then(([created]) => created);
    }
}
exports.WalletConversionRepairOperationRepository = WalletConversionRepairOperationRepository;
exports.walletConversionRepairOperationRepository = new WalletConversionRepairOperationRepository();
