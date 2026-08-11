import { ClientSession } from "mongoose";
import { IWithdrawalCreatorBalanceProjectionOperation, WithdrawalCreatorBalanceProjectionOperation } from "../models/withdrawalCreatorBalanceProjectionOperation.model";
export class WithdrawalCreatorBalanceProjectionOperationRepository { findByReference(operationReference: string, session?: ClientSession) { return WithdrawalCreatorBalanceProjectionOperation.findOne({ operationReference }).session(session ?? null).exec(); } create(data: Partial<IWithdrawalCreatorBalanceProjectionOperation>, session: ClientSession) { return new WithdrawalCreatorBalanceProjectionOperation(data).save({ session }); } }
export const withdrawalCreatorBalanceProjectionOperationRepository = new WithdrawalCreatorBalanceProjectionOperationRepository();
