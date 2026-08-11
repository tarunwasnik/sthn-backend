// backend/src/repositories/internalProvider/internalWebhook.repository.ts

import { Types, UpdateQuery } from "mongoose";

import InternalWebhookModel, {
  InternalWebhookDocument,
} from "../../models/internalProvider/internalWebhook.model";

/**
 * ------------------------------------------------------------------
 * Internal Webhook Repository
 * ------------------------------------------------------------------
 *
 * Encapsulates all persistence operations for InternalWebhook.
 *
 * This repository contains no business logic.
 * ------------------------------------------------------------------
 */

type QueryFilter = Record<string, unknown>;

export class InternalWebhookRepository {
  /**
   * Create a provider webhook.
   */
  async create(
    data: Partial<InternalWebhookDocument>,
  ): Promise<InternalWebhookDocument> {
    return InternalWebhookModel.create(data);
  }

  /**
   * Find by Mongo id.
   */
  async findById(
    id: Types.ObjectId | string,
  ): Promise<InternalWebhookDocument | null> {
    return InternalWebhookModel.findById(id);
  }

  /**
   * Find by provider webhook id.
   */
  async findByProviderWebhookId(
    providerWebhookId: string,
  ): Promise<InternalWebhookDocument | null> {
    return InternalWebhookModel.findOne({
      providerWebhookId,
    });
  }

  /**
   * Find by provider entity id.
   */
  async findByProviderEntityId(
    providerEntityId: string,
  ): Promise<InternalWebhookDocument | null> {
    return InternalWebhookModel.findOne({
      providerEntityId,
    });
  }

  /**
   * Find by provider payment id.
   */
  async findByProviderPaymentId(
    providerPaymentId: string,
  ): Promise<InternalWebhookDocument | null> {
    return InternalWebhookModel.findOne({
      providerPaymentId,
    });
  }

  /**
   * Find by idempotency key.
   */
  async findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<InternalWebhookDocument | null> {
    return InternalWebhookModel.findOne({
      idempotencyKey,
    });
  }

  /**
   * Find using an arbitrary filter.
   */
  async findOne(filter: QueryFilter): Promise<InternalWebhookDocument | null> {
    return InternalWebhookModel.findOne(filter);
  }

  /**
   * Find multiple provider webhooks.
   */
  async findMany(filter: QueryFilter = {}): Promise<InternalWebhookDocument[]> {
    return InternalWebhookModel.find(filter);
  }

  /**
   * Count provider webhooks.
   */
  async count(filter: QueryFilter = {}): Promise<number> {
    return InternalWebhookModel.countDocuments(filter);
  }

  /**
   * Update a provider webhook by id.
   */
  async updateById(
    id: Types.ObjectId | string,
    update: UpdateQuery<InternalWebhookDocument>,
  ): Promise<InternalWebhookDocument | null> {
    return InternalWebhookModel.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    });
  }

  /**
   * Update a provider webhook using a filter.
   */
  async updateOne(
    filter: QueryFilter,
    update: UpdateQuery<InternalWebhookDocument>,
  ): Promise<InternalWebhookDocument | null> {
    return InternalWebhookModel.findOneAndUpdate(filter, update, {
      new: true,
      runValidators: true,
    });
  }

  /**
   * Check whether a provider webhook exists.
   */
  async exists(filter: QueryFilter): Promise<boolean> {
    const document = await InternalWebhookModel.exists(filter);

    return document !== null;
  }
}

export default new InternalWebhookRepository();
