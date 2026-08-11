// backend/src/repositories/internalProvider/internalRefund.repository.ts

import { Types, UpdateQuery, ClientSession } from "mongoose";

import InternalRefundModel, {
  InternalRefundDocument,
} from "../../models/internalProvider/internalRefund.model";

/**
 * ------------------------------------------------------------------
 * Internal Refund Repository
 * ------------------------------------------------------------------
 *
 * Encapsulates all persistence operations for InternalRefund.
 *
 * This repository contains no business logic.
 * ------------------------------------------------------------------
 */

type QueryFilter = Record<string, unknown>;

export class InternalRefundRepository {
  /**
   * Create a provider refund.
   */
  async create(
    data: Partial<InternalRefundDocument>,
    session?: ClientSession,
  ): Promise<InternalRefundDocument> {
    if (!session) return InternalRefundModel.create(data);
    const [refund] = await InternalRefundModel.create([data], { session });
    return refund;
  }

  /**
   * Find by Mongo id.
   */
  async findById(
    id: Types.ObjectId | string,
  ): Promise<InternalRefundDocument | null> {
    return InternalRefundModel.findById(id);
  }

  /**
   * Find by Financial Domain refund.
   */
  async findByRefundId(
    refundId: Types.ObjectId,
  ): Promise<InternalRefundDocument | null> {
    return InternalRefundModel.findOne({
      refundId,
    });
  }

  /**
   * Find by provider refund id.
   */
  async findByProviderRefundId(
    providerRefundId: string,
  ): Promise<InternalRefundDocument | null> {
    return InternalRefundModel.findOne({
      providerRefundId,
    });
  }

  /**
   * Find by provider payment id.
   */
  async findByProviderPaymentId(
    providerPaymentId: string,
  ): Promise<InternalRefundDocument | null> {
    return InternalRefundModel.findOne({
      providerPaymentId,
    });
  }

  /**
   * Find by idempotency key.
   */
  async findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<InternalRefundDocument | null> {
    return InternalRefundModel.findOne({
      idempotencyKey,
    });
  }

  async findByIdempotencyKeyForReplay(idempotencyKey: string): Promise<InternalRefundDocument | null> {
    return InternalRefundModel.findOne({ idempotencyKey }).select("+requestFingerprint").exec();
  }

  /**
   * Find using an arbitrary filter.
   */
  async findOne(filter: QueryFilter): Promise<InternalRefundDocument | null> {
    return InternalRefundModel.findOne(filter);
  }

  /**
   * Find multiple provider refunds.
   */
  async findMany(filter: QueryFilter = {}): Promise<InternalRefundDocument[]> {
    return InternalRefundModel.find(filter);
  }

  /**
   * Count provider refunds.
   */
  async count(filter: QueryFilter = {}): Promise<number> {
    return InternalRefundModel.countDocuments(filter);
  }

  /**
   * Update a provider refund by id.
   */
  async updateById(
    id: Types.ObjectId | string,
    update: UpdateQuery<InternalRefundDocument>,
    session?: ClientSession,
  ): Promise<InternalRefundDocument | null> {
    return InternalRefundModel.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true, session,
    });
  }

  /**
   * Update a provider refund using a filter.
   */
  async updateOne(
    filter: QueryFilter,
    update: UpdateQuery<InternalRefundDocument>,
    session?: ClientSession,
  ): Promise<InternalRefundDocument | null> {
    return InternalRefundModel.findOneAndUpdate(filter, update, {
      new: true,
      runValidators: true, session,
    });
  }

  /**
   * Check whether a provider refund exists.
   */
  async exists(filter: QueryFilter): Promise<boolean> {
    const document = await InternalRefundModel.exists(filter);

    return document !== null;
  }
}

export default new InternalRefundRepository();
