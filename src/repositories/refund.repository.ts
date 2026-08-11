// backend/src/repositories/refund.repository.ts

import { IRefund, Refund } from "../models/refund.model";

export class RefundRepository {
  async create(data: Partial<IRefund>): Promise<IRefund> {
    return Refund.create(data);
  }

  async findById(id: string): Promise<IRefund | null> {
    return Refund.findById(id).exec();
  }

  async findByRefundReference(
    refundReference: string,
  ): Promise<IRefund | null> {
    return Refund.findOne({ refundReference }).exec();
  }

  async findByPaymentId(paymentId: string): Promise<IRefund[]> {
    return Refund.find({ paymentId }).sort({ createdAt: -1 }).exec();
  }

  async findByBookingId(bookingId: string): Promise<IRefund[]> {
    return Refund.find({ bookingId }).sort({ createdAt: -1 }).exec();
  }

  async findByUserId(userId: string): Promise<IRefund[]> {
    return Refund.find({ userId }).sort({ createdAt: -1 }).exec();
  }

  async findByCreatorId(creatorId: string): Promise<IRefund[]> {
    return Refund.find({ creatorId }).sort({ createdAt: -1 }).exec();
  }

  async findByProviderRefundId(
    providerRefundId: string,
  ): Promise<IRefund | null> {
    return Refund.findOne({ providerRefundId }).exec();
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<IRefund | null> {
    return Refund.findOne({ idempotencyKey }).exec();
  }

  async findOne(filter: Record<string, unknown>): Promise<IRefund | null> {
    return Refund.findOne(filter).exec();
  }

  async findMany(filter: Record<string, unknown>): Promise<IRefund[]> {
    return Refund.find(filter).sort({ createdAt: -1 }).exec();
  }

  async updateById(
    id: string,
    update: Record<string, unknown>,
  ): Promise<IRefund | null> {
    return Refund.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    }).exec();
  }

  async updateOne(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
  ): Promise<IRefund | null> {
    return Refund.findOneAndUpdate(filter, update, {
      new: true,
      runValidators: true,
    }).exec();
  }

  async exists(filter: Record<string, unknown>): Promise<boolean> {
    const result = await Refund.exists(filter);

    return result !== null;
  }

  async count(filter: Record<string, unknown> = {}): Promise<number> {
    return Refund.countDocuments(filter).exec();
  }

  async deleteById(id: string): Promise<IRefund | null> {
    return Refund.findByIdAndDelete(id).exec();
  }
}

export const refundRepository = new RefundRepository();
