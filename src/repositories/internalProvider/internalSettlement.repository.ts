// backend/src/repositories/internalProvider/internalSettlement.repository.ts

import { Types, UpdateQuery } from "mongoose";

import InternalSettlementModel, {
  InternalSettlementDocument,
} from "../../models/internalProvider/internalSettlement.model";

/**
 * ------------------------------------------------------------------
 * Internal Settlement Repository
 * ------------------------------------------------------------------
 *
 * Encapsulates all persistence operations for InternalSettlement.
 *
 * This repository contains no business logic.
 * ------------------------------------------------------------------
 */

type QueryFilter = Record<string, unknown>;

export class InternalSettlementRepository {
  /**
   * Create a provider settlement.
   */
  async create(
    data: Partial<InternalSettlementDocument>,
  ): Promise<InternalSettlementDocument> {
    return InternalSettlementModel.create(data);
  }

  /**
   * Find by Mongo id.
   */
  async findById(
    id: Types.ObjectId | string,
  ): Promise<InternalSettlementDocument | null> {
    return InternalSettlementModel.findById(id);
  }

  /**
   * Find by Financial Domain settlement.
   */
  async findBySettlementId(
    settlementId: Types.ObjectId,
  ): Promise<InternalSettlementDocument | null> {
    return InternalSettlementModel.findOne({
      settlementId,
    });
  }

  /**
   * Find by provider settlement id.
   */
  async findByProviderSettlementId(
    providerSettlementId: string,
  ): Promise<InternalSettlementDocument | null> {
    return InternalSettlementModel.findOne({
      providerSettlementId,
    });
  }

  /**
   * Find by provider payment id.
   */
  async findByProviderPaymentId(
    providerPaymentId: string,
  ): Promise<InternalSettlementDocument | null> {
    return InternalSettlementModel.findOne({
      providerPaymentId,
    });
  }

  /**
   * Find by idempotency key.
   */
  async findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<InternalSettlementDocument | null> {
    return InternalSettlementModel.findOne({
      idempotencyKey,
    });
  }

  /**
   * Find using an arbitrary filter.
   */
  async findOne(
    filter: QueryFilter,
  ): Promise<InternalSettlementDocument | null> {
    return InternalSettlementModel.findOne(filter);
  }

  /**
   * Find multiple provider settlements.
   */
  async findMany(
    filter: QueryFilter = {},
  ): Promise<InternalSettlementDocument[]> {
    return InternalSettlementModel.find(filter);
  }

  /**
   * Count provider settlements.
   */
  async count(filter: QueryFilter = {}): Promise<number> {
    return InternalSettlementModel.countDocuments(filter);
  }

  /**
   * Update a provider settlement by id.
   */
  async updateById(
    id: Types.ObjectId | string,
    update: UpdateQuery<InternalSettlementDocument>,
  ): Promise<InternalSettlementDocument | null> {
    return InternalSettlementModel.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    });
  }

  /**
   * Update a provider settlement using a filter.
   */
  async updateOne(
    filter: QueryFilter,
    update: UpdateQuery<InternalSettlementDocument>,
  ): Promise<InternalSettlementDocument | null> {
    return InternalSettlementModel.findOneAndUpdate(filter, update, {
      new: true,
      runValidators: true,
    });
  }

  /**
   * Check whether a provider settlement exists.
   */
  async exists(filter: QueryFilter): Promise<boolean> {
    const document = await InternalSettlementModel.exists(filter);

    return document !== null;
  }
}

export default new InternalSettlementRepository();
