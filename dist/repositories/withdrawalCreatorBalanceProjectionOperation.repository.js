"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withdrawalCreatorBalanceProjectionOperationRepository = exports.WithdrawalCreatorBalanceProjectionOperationRepository = void 0;
const withdrawalCreatorBalanceProjectionOperation_model_1 = require("../models/withdrawalCreatorBalanceProjectionOperation.model");
class WithdrawalCreatorBalanceProjectionOperationRepository {
    findByReference(operationReference, session) { return withdrawalCreatorBalanceProjectionOperation_model_1.WithdrawalCreatorBalanceProjectionOperation.findOne({ operationReference }).session(session ?? null).exec(); }
    create(data, session) { return new withdrawalCreatorBalanceProjectionOperation_model_1.WithdrawalCreatorBalanceProjectionOperation(data).save({ session }); }
}
exports.WithdrawalCreatorBalanceProjectionOperationRepository = WithdrawalCreatorBalanceProjectionOperationRepository;
exports.withdrawalCreatorBalanceProjectionOperationRepository = new WithdrawalCreatorBalanceProjectionOperationRepository();
