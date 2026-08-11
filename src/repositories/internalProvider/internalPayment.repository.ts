// backend/src/repositories/internalProvider/internalPayment.repository.ts

import { Types, UpdateQuery, ClientSession } from "mongoose";

import InternalPaymentModel, {
  InternalPaymentDocument,
} from "../../models/internalProvider/internalPayment.model";

/**
 * ------------------------------------------------------------------
 * Internal Payment Repository
 * ------------------------------------------------------------------
 *
 * Encapsulates all persistence operations for InternalPayment.
 *
 * This repository contains no business logic.
 * ------------------------------------------------------------------
 */
type QueryFilter = Record<string, unknown>;

export class InternalPaymentRepository {
  /**
   * Create a provider payment.
   */
  async create(
    data: Partial<InternalPaymentDocument>,
    session?: ClientSession,
  ): Promise<InternalPaymentDocument> {
    if (!session) return InternalPaymentModel.create(data);
    const [payment] = await InternalPaymentModel.create([data], { session });
    return payment;
  }

  /**
   * Find by Mongo id.
   */
  async findById(
    id: Types.ObjectId | string,
    session?: ClientSession,
  ): Promise<InternalPaymentDocument | null> {
    return InternalPaymentModel.findById(id).session(session ?? null);
  }

  /**
   * Find by Financial Domain payment.
   */
  async findByPaymentId(
    paymentId: Types.ObjectId,
  ): Promise<InternalPaymentDocument | null> {
    return InternalPaymentModel.findOne({
      paymentId,
    });
  }

  /**
   * Find by provider payment id.
   */
  async findByProviderPaymentId(
    providerPaymentId: string,
  ): Promise<InternalPaymentDocument | null> {
    return InternalPaymentModel.findOne({
      providerPaymentId,
    });
  }

  /**
   * Find by provider transaction id.
   */
  async findByProviderTransactionId(
    providerTransactionId: string,
  ): Promise<InternalPaymentDocument | null> {
    return InternalPaymentModel.findOne({
      providerTransactionId,
    });
  }

  /**
   * Find by idempotency key.
   */
  async findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<InternalPaymentDocument | null> {
    return InternalPaymentModel.findOne({
      idempotencyKey,
    });
  }

  /** Read the hidden replay fingerprint only for creation consistency checks. */
  async findByIdempotencyKeyForReplay(
    idempotencyKey: string,
  ): Promise<InternalPaymentDocument | null> {
    return InternalPaymentModel.findOne({ idempotencyKey })
      .select("+requestFingerprint")
      .exec();
  }
  /**
   * Find using an arbitrary filter.
   */
  async findOne(filter: QueryFilter): Promise<InternalPaymentDocument | null> {
    return InternalPaymentModel.findOne(filter);
  }

  /**
   * Find multiple provider payments.
   */
  async findMany(filter: QueryFilter = {}): Promise<InternalPaymentDocument[]> {
    return InternalPaymentModel.find(filter);
  }

  /**
   * Count provider payments.
   */
  async count(filter: QueryFilter = {}): Promise<number> {
    return InternalPaymentModel.countDocuments(filter);
  }

  /**
   * Update a provider payment using a filter.
   */
  async updateOne(
    filter: QueryFilter,
    update: UpdateQuery<InternalPaymentDocument>,
    session?: ClientSession,
  ): Promise<InternalPaymentDocument | null> {
    return InternalPaymentModel.findOneAndUpdate(filter, update, {
      new: true,
      runValidators: true,
      session,
    });
  }

  /**
   * Check whether a provider payment exists.
   */
  async exists(filter: QueryFilter): Promise<boolean> {
    const document = await InternalPaymentModel.exists(filter);

    return document !== null;
  }

  /**
   * Find provider payments with pagination.
   */
  async paginate(
    filter: QueryFilter,
    page: number,
    limit: number,
  ): Promise<InternalPaymentDocument[]> {
    const skip = (page - 1) * limit;

    return InternalPaymentModel.find(filter).skip(skip).limit(limit);
  }
}

export default new InternalPaymentRepository();
