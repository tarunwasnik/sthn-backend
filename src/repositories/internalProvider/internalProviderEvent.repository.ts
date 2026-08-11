// backend/src/repositories/internalProvider/internalProviderEvent.repository.ts

import { ClientSession, Types } from "mongoose";

import InternalProviderEventModel, {
  InternalProviderEventDocument,
} from "../../models/internalProvider/internalProviderEvent.model";

import {
  ProviderEntityType,
  ProviderEventType,
  ProviderOperation,
} from "../../constants/internalProvider";

/**
 * ------------------------------------------------------------------
 * Internal Provider Event Repository
 * ------------------------------------------------------------------
 *
 * Encapsulates all persistence operations for InternalProviderEvent.
 *
 * This repository is append-only and therefore intentionally exposes
 * no update operations.
 *
 * This repository contains no business logic.
 * ------------------------------------------------------------------
 */

type QueryFilter = Record<string, unknown>;

export class InternalProviderEventRepository {
  /**
   * Create a provider event.
   */
  async create(
    data: Partial<InternalProviderEventDocument>,
    session?: ClientSession,
  ): Promise<InternalProviderEventDocument> {
    const event = new InternalProviderEventModel(data);
    return event.save({ session });
  }

  /**
   * Find by Mongo id.
   */
  async findById(
    id: Types.ObjectId | string,
  ): Promise<InternalProviderEventDocument | null> {
    return InternalProviderEventModel.findById(id);
  }

  /**
   * Find provider events by provider entity id.
   */
  async findByProviderEntityId(
    providerEntityId: string,
  ): Promise<InternalProviderEventDocument[]> {
    return InternalProviderEventModel.find({
      providerEntityId,
    }).sort({
      occurredAt: -1,
    });
  }

  /**
   * Find provider events by provider payment id.
   */
  async findByProviderPaymentId(
    providerPaymentId: string,
  ): Promise<InternalProviderEventDocument[]> {
    return InternalProviderEventModel.find({
      providerPaymentId,
    }).sort({
      occurredAt: -1,
    });
  }

  /**
   * Find provider events for an Internal Provider entity.
   */
  async findByEntity(
    entityType: ProviderEntityType,
    entityId: Types.ObjectId | string,
  ): Promise<InternalProviderEventDocument[]> {
    return InternalProviderEventModel.find({
      entityType,
      entityId,
    }).sort({
      occurredAt: -1,
    });
  }

  /**
   * Find provider events by event type.
   */
  async findByEventType(
    eventType: ProviderEventType,
  ): Promise<InternalProviderEventDocument[]> {
    return InternalProviderEventModel.find({
      eventType,
    }).sort({
      occurredAt: -1,
    });
  }

  /**
   * Find provider events by operation.
   */
  async findByOperation(
    operation: ProviderOperation,
  ): Promise<InternalProviderEventDocument[]> {
    return InternalProviderEventModel.find({
      operation,
    }).sort({
      occurredAt: -1,
    });
  }

  /**
   * Find using an arbitrary filter.
   */
  async findOne(
    filter: QueryFilter,
  ): Promise<InternalProviderEventDocument | null> {
    return InternalProviderEventModel.findOne(filter);
  }

  /**
   * Find multiple provider events.
   */
  async findMany(
    filter: QueryFilter = {},
    session?: ClientSession,
  ): Promise<InternalProviderEventDocument[]> {
    return InternalProviderEventModel.find(filter).session(session ?? null);
  }

  /**
   * Count provider events.
   */
  async count(filter: QueryFilter = {}): Promise<number> {
    return InternalProviderEventModel.countDocuments(filter);
  }

  /**
   * Check whether a provider event exists.
   */
  async exists(filter: QueryFilter): Promise<boolean> {
    const document = await InternalProviderEventModel.exists(filter);

    return document !== null;
  }
}

export default new InternalProviderEventRepository();
