import { ClientSession } from "mongoose";
import { IPaymentOperation, PaymentOperation, PaymentOperationHistoryEntry } from "../models/paymentOperation.model";
import { PaymentOperationStatus } from "../enums/financial/paymentOperationStatus.enum";

export class PaymentOperationRepository {
  findByPaymentId(paymentId: string, session?: ClientSession) {
    return PaymentOperation.findOne({ paymentId }).select("+userId +idempotencyKey").session(session ?? null).exec();
  }
  findById(id: IPaymentOperation["_id"]) {
    return PaymentOperation.findById(id).select("+userId +idempotencyKey").exec();
  }
  findByProviderPaymentId(provider: string, providerPaymentId: string) {
    return PaymentOperation.findOne({ provider, providerPaymentId }).select("+userId +idempotencyKey").exec();
  }
  create(data: Partial<IPaymentOperation>, session?: ClientSession) {
    if (!session) return PaymentOperation.create(data);
    return PaymentOperation.create([data], { session }).then(([operation]) => operation);
  }
  claimSessionDispatch(operation: IPaymentOperation, at: Date) {
    return PaymentOperation.findOneAndUpdate({
      _id: operation._id, paymentId: operation.paymentId, bookingId: operation.bookingId,
      userId: operation.userId, provider: operation.provider, idempotencyKey: operation.idempotencyKey,
      requestedAmount: operation.requestedAmount, requestedCurrency: operation.requestedCurrency,
      status: PaymentOperationStatus.PENDING, attemptCount: 0,
      dispatchStartedAt: { $exists: false }, dispatchKind: { $exists: false },
      providerPaymentId: { $exists: false },
    }, {
      $set: { dispatchStartedAt: at, dispatchKind: "PAYMENT_SESSION", lastAttemptAt: at },
      $inc: { attemptCount: 1 },
      $push: { history: { kind: "ATTEMPT_STARTED", occurredAt: at } },
    }, { new: true, runValidators: true, writeConcern: { w: "majority" } })
      .select("+userId +idempotencyKey").exec();
  }
  async update(id: IPaymentOperation["_id"], update: Record<string, unknown>, history: PaymentOperationHistoryEntry): Promise<IPaymentOperation> {
    const operation = await PaymentOperation.findByIdAndUpdate(id, { $set: update, $push: { history } }, { new: true, runValidators: true }).select("+userId +idempotencyKey").exec();
    if (!operation) throw new Error("Payment operation disappeared during update.");
    return operation;
  }
  async transitionReconciliation(input: {
    operationId: IPaymentOperation["_id"];
    providerPaymentId: string;
    expectedStatuses: PaymentOperationStatus[];
    update: Record<string, unknown>;
    history: PaymentOperationHistoryEntry;
  }): Promise<IPaymentOperation | null> {
    return PaymentOperation.findOneAndUpdate(
      {
        _id: input.operationId,
        providerPaymentId: input.providerPaymentId,
        status: { $in: input.expectedStatuses },
      },
      {
        $set: input.update,
        $inc: { reconciliationAttemptCount: 1 },
        $push: { history: input.history },
      },
      { new: true, runValidators: true },
    ).select("+userId +idempotencyKey").exec();
  }
  bindRazorpayPayment(operation: IPaymentOperation, orderId: string, paymentId: string) {
    return PaymentOperation.findOneAndUpdate({ _id: operation._id, provider: "RAZORPAY", providerOrderId: orderId, providerPaymentId: orderId, status: { $in: [PaymentOperationStatus.PENDING, PaymentOperationStatus.UNKNOWN] } }, { $set: { providerPaymentId: paymentId, providerTransactionId: paymentId }, $push: { history: { kind: "PROVIDER_LINKED", occurredAt: new Date(), note: "Razorpay captured payment bound to durable order." } } }, { new: true, runValidators: true }).select("+userId +idempotencyKey").exec();
  }
}

export const paymentOperationRepository = new PaymentOperationRepository();
