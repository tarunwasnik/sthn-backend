//backend/src/types/internalProvider/providerEvent.types.ts

import { Types } from "mongoose";

import {
  ProviderEntityType,
  ProviderEventType,
  ProviderOperation,
} from "../../constants/internalProvider";

import {
  ProviderAuditInfo,
  ProviderExecutionInfo,
  ProviderMetadata,
  ProviderPayloadInfo,
} from ".";

export interface CreateProviderEventRequest {
  entityType: ProviderEntityType;
  entityId: Types.ObjectId;

  eventType: ProviderEventType;
  operation: ProviderOperation;
  transitionKey?: string;

  providerEntityId: string;
  providerPaymentId?: string;
  providerReference?: string;

  providerMetadata: ProviderMetadata;

  execution: ProviderExecutionInfo;

  audit: ProviderAuditInfo;

  payloads?: ProviderPayloadInfo;
  occurredAt?: Date;
}
