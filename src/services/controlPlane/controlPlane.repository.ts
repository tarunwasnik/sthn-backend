//backend/src/rervices/controlPlane/controlPlane.repository.ts

import { ControlPlaneControl } from "../../models/controlPlaneControl.model";
import {
  ControlPlaneRule,
  ControlPlaneScope,
  ControlPlaneEnforcement,
} from "../../types/controlPlane.types";

export interface CreateControlPlaneInput {
  scope: ControlPlaneScope;
  target: string | null;
  enforcement: ControlPlaneEnforcement;
  reason: string;
  expiresAt?: Date;
  isActive: boolean;
  createdBy: {
    adminId: string;
    email?: string;
  };
}

export class ControlPlaneRepository {
  static async fetchActiveControls(): Promise<ControlPlaneRule[]> {
    const now = new Date();

    const controls = await ControlPlaneControl.find({
      isActive: true,
      $or: [
        { expiresAt: { $exists: false } },
        { expiresAt: null },
        { expiresAt: { $gt: now } },
      ],
    })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return controls.map(ControlPlaneRepository.toRule);
  }

  static async createControl(
    input: CreateControlPlaneInput
  ): Promise<ControlPlaneRule> {
    const control = await ControlPlaneControl.create(input);
    return ControlPlaneRepository.toRule(control.toObject());
  }

  static async deactivateControl(controlId: string): Promise<void> {
    await ControlPlaneControl.updateOne(
      { _id: controlId },
      { $set: { isActive: false } }
    ).exec();
  }

  private static toRule(doc: any): ControlPlaneRule {
    return {
      id: doc._id.toString(),
      scope: doc.scope,
      target: doc.target ?? null,
      enforcement: doc.enforcement,
      reason: doc.reason,
      isActive: doc.isActive,
      expiresAt: doc.expiresAt ?? undefined,
      createdAt: doc.createdAt,
    };
  }
}
