//backend/src/rervices/controlPlane/featureFlag.service.ts

import mongoose from "mongoose";
import { FeatureFlag } from "../../models/featureFlag.model";
import { CreateFeatureFlagPayload } from "../../types/featureFlag.types";

const normalizeConditions = (conditions?: {
  roles?: string[];
  userIds?: string[];
}) => {
  if (!conditions) return undefined;

  return {
    roles: conditions.roles,
    userIds: conditions.userIds?.map(
      (id) => new mongoose.Types.ObjectId(id)
    ),
  };
};

export class FeatureFlagService {
  static async getAll() {
    return FeatureFlag.find().sort({ createdAt: -1 });
  }

  static async create(
    payload: CreateFeatureFlagPayload,
    adminId: string
  ) {
    return FeatureFlag.create({
      key: payload.key,
      description: payload.description,
      enabled: payload.enabled ?? false,
      scope: payload.scope ?? "GLOBAL",
      conditions: normalizeConditions(payload.conditions),
      createdBy: new mongoose.Types.ObjectId(adminId),
    });
  }

  static async update(
    flagId: string,
    payload: Partial<CreateFeatureFlagPayload>,
    adminId: string
  ) {
    return FeatureFlag.findByIdAndUpdate(
      flagId,
      {
        ...payload,
        conditions: normalizeConditions(payload.conditions),
        updatedBy: new mongoose.Types.ObjectId(adminId),
      },
      { new: true }
    );
  }

  static async toggle(
    flagId: string,
    enabled: boolean,
    adminId: string
  ) {
    return FeatureFlag.findByIdAndUpdate(
      flagId,
      {
        enabled,
        updatedBy: new mongoose.Types.ObjectId(adminId),
      },
      { new: true }
    );
  }

  static async remove(flagId: string) {
    return FeatureFlag.findByIdAndDelete(flagId);
  }
}
