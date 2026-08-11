// backend/src/repositories/internalProvider/internalPayout.repository.ts

import { ClientSession, Types, UpdateQuery } from "mongoose";

import InternalPayoutModel, {
  InternalPayoutDocument,
} from "../../models/internalProvider/internalPayout.model";

/**
 * ------------------------------------------------------------------
 * Internal Payout Repository
 * ------------------------------------------------------------------
 *
 * Encapsulates all persistence operations for InternalPayout.
 *
 * This repository contains no business logic.
 * ------------------------------------------------------------------
 */

type QueryFilter = Record<string, unknown>;

export class InternalPayoutRepository {
  /**
   * Create a provider payout.
   */
  async create(
    data: Partial<InternalPayoutDocument>,
    session?: ClientSession,
  ): Promise<InternalPayoutDocument> {
    if (!session) return InternalPayoutModel.create(data);
    const [payout] = await InternalPayoutModel.create([data], { session });
    return payout;
  }

  /**
   * Find by Mongo id.
   */
  async findById(
    id: Types.ObjectId | string,
  ): Promise<InternalPayoutDocument | null> {
    return InternalPayoutModel.findById(id);
  }

  /**
   * Find by Financial Domain payout.
   */
  async findByPayoutId(
    payoutId: Types.ObjectId,
  ): Promise<InternalPayoutDocument | null> {
    return InternalPayoutModel.findOne({
      payoutId,
    });
  }

  /**
   * Find by provider payout id.
   */
  async findByProviderPayoutId(
    providerPayoutId: string,
    session?: ClientSession,
  ): Promise<InternalPayoutDocument | null> {
    return InternalPayoutModel.findOne({
      providerPayoutId,
    }).session(session ?? null);
  }

  /**
   * Find by provider settlement id.
   */
  async findByProviderSettlementId(
    providerSettlementId: string,
  ): Promise<InternalPayoutDocument | null> {
    return InternalPayoutModel.findOne({
      providerSettlementId,
    });
  }

  /**
   * Find by provider payment id.
   */
  async findByProviderPaymentId(
    providerPaymentId: string,
  ): Promise<InternalPayoutDocument | null> {
    return InternalPayoutModel.findOne({
      providerPaymentId,
    });
  }

  /**
   * Find by idempotency key.
   */
  async findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<InternalPayoutDocument | null> {
    return InternalPayoutModel.findOne({
      idempotencyKey,
    });
  }

  async findByIdempotencyKeyForDestinationConsistency(
    idempotencyKey: string,
  ): Promise<InternalPayoutDocument | null> {
    return InternalPayoutModel.findOne({ idempotencyKey })
      .select("+providerDestination.fingerprint")
      .exec();
  }

  /**
   * Find using an arbitrary filter.
   */
  async findOne(filter: QueryFilter): Promise<InternalPayoutDocument | null> {
    return InternalPayoutModel.findOne(filter);
  }

  /**
   * Find multiple provider payouts.
   */
  async findMany(filter: QueryFilter = {}): Promise<InternalPayoutDocument[]> {
    return InternalPayoutModel.find(filter);
  }

  /**
   * Count provider payouts.
   */
  async count(filter: QueryFilter = {}): Promise<number> {
    return InternalPayoutModel.countDocuments(filter);
  }

  /**
   * Update a provider payout by id.
   */
  async updateById(
    id: Types.ObjectId | string,
    update: UpdateQuery<InternalPayoutDocument>,
  ): Promise<InternalPayoutDocument | null> {
    return InternalPayoutModel.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    });
  }

  /**
   * Update a provider payout using a filter.
   */
  async updateOne(
    filter: QueryFilter,
    update: UpdateQuery<InternalPayoutDocument>,
    session?: ClientSession,
  ): Promise<InternalPayoutDocument | null> {
    return InternalPayoutModel.findOneAndUpdate(filter, update, {
      new: true,
      runValidators: true,
      session,
    });
  }

  /**
   * Check whether a provider payout exists.
   */
  async exists(filter: QueryFilter): Promise<boolean> {
    const document = await InternalPayoutModel.exists(filter);

    return document !== null;
  }
}

export default new InternalPayoutRepository();
