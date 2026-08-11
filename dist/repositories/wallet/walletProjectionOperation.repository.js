"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletProjectionOperationRepository = exports.WalletProjectionOperationRepository = void 0;
const walletProjectionOperation_model_1 = require("../../models/walletProjectionOperation.model");
class WalletProjectionOperationRepository {
    async findById(id) { return walletProjectionOperation_model_1.WalletProjectionOperation.findById(id).select("+fingerprint").exec(); }
    async create(data, session) {
        const [operation] = await walletProjectionOperation_model_1.WalletProjectionOperation.create([data], { session });
        return operation;
    }
    async findByOperationKey(operationKey, session) {
        return walletProjectionOperation_model_1.WalletProjectionOperation.findOne({ operationKey })
            .select("+fingerprint")
            .session(session ?? null)
            .exec();
    }
}
exports.WalletProjectionOperationRepository = WalletProjectionOperationRepository;
exports.walletProjectionOperationRepository = new WalletProjectionOperationRepository();
