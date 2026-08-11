//backend/src/services/internalProvider/events/providerEvent.service.ts

import { ClientSession, Types } from "mongoose";

import InternalProviderEventRepository from "../../../repositories/internalProvider/internalProviderEvent.repository";

import {
  ProviderEntityType,
  ProviderEventType,
  ProviderOperation,
} from "../../../constants/internalProvider";

import { CreateProviderEventRequest } from "../../../types/internalProvider";

import { InternalProviderEventDocument } from "../../../models/internalProvider/internalProviderEvent.model";

import ProviderClockService from "../base/providerClock.service";

/**
 * ------------------------------------------------------------------
 * STHN Internal Provider Platform
 * Provider Event Service
 * ------------------------------------------------------------------
 *
 * Responsible for creating immutable provider audit events.
 *
 * Every provider operation should record an event through this service.
 *
 * This service is append-only.
 * Existing events are never modified.
 * ------------------------------------------------------------------
 */
export class ProviderEventService {
  /**
   * Record a provider event.
   */
  async recordEvent(
    params: CreateProviderEventRequest,
    session?: ClientSession,
  ): Promise<InternalProviderEventDocument> {
    return InternalProviderEventRepository.create({
      entityType: params.entityType,
      entityId: params.entityId,

      eventType: params.eventType,
      operation: params.operation,
      transitionKey: params.transitionKey,

      providerEntityId: params.providerEntityId,
      providerPaymentId: params.providerPaymentId,
      providerReference: params.providerReference,

      providerMetadata: params.providerMetadata,
      execution: params.execution,
      audit: params.audit,

      payloads: {
        request: params.payloads?.request ?? null,
        response: params.payloads?.response ?? null,
      },

      occurredAt: params.occurredAt ?? ProviderClockService.now(),
    }, session);
  }

  /**
   * Find an event by Mongo id.
   */
  async findById(
    id: Types.ObjectId | string,
  ): Promise<InternalProviderEventDocument | null> {
    return InternalProviderEventRepository.findById(id);
  }

  /**
   * Retrieve the timeline for a provider entity.
   */
  async getEntityTimeline(
    entityType: ProviderEntityType,
    entityId: Types.ObjectId,
  ): Promise<InternalProviderEventDocument[]> {
    return InternalProviderEventRepository.findByEntity(entityType, entityId);
  }

  /**
   * Retrieve provider events using the provider entity id.
   */
  async getProviderTimeline(
    providerEntityId: string,
  ): Promise<InternalProviderEventDocument[]> {
    return InternalProviderEventRepository.findByProviderEntityId(
      providerEntityId,
    );
  }

  /**
   * Retrieve all events belonging to a provider payment.
   */
  async getPaymentTimeline(
    providerPaymentId: string,
  ): Promise<InternalProviderEventDocument[]> {
    return InternalProviderEventRepository.findByProviderPaymentId(
      providerPaymentId,
    );
  }

  /**
   * Retrieve events by type.
   */
  async getByEventType(
    eventType: ProviderEventType,
  ): Promise<InternalProviderEventDocument[]> {
    return InternalProviderEventRepository.findByEventType(eventType);
  }

  /**
   * Retrieve events by operation.
   */
  async getByOperation(
    operation: ProviderOperation,
  ): Promise<InternalProviderEventDocument[]> {
    return InternalProviderEventRepository.findByOperation(operation);
  }
}

export default new ProviderEventService();
