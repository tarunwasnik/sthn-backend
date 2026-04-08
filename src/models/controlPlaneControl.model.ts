//backend/src/models/controlPlaneControl.model.ts

import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Control Plane enforcement modes.
 */
export enum ControlPlaneEnforcement {
  ALLOW = "ALLOW",
  FORCE_DRY_RUN = "FORCE_DRY_RUN",
  BLOCK = "BLOCK",
}

/**
 * Control Plane scope.
 */
export enum ControlPlaneScope {
  GLOBAL = "GLOBAL",
  ACTION = "ACTION",
  EMERGENCY = "EMERGENCY",
}

/**
 * Mongo document interface
 */
export interface ControlPlaneControlDocument extends Document {
  scope: ControlPlaneScope;
  target: string | null;
  enforcement: ControlPlaneEnforcement;
  reason: string;

  createdBy: {
    adminId: string;
    email?: string;
  };

  expiresAt?: Date;
  isActive: boolean;

  createdAt: Date;
  updatedAt: Date;
}

const ControlPlaneControlSchema = new Schema<ControlPlaneControlDocument>(
  {
    scope: {
      type: String,
      enum: Object.values(ControlPlaneScope),
      required: true,
      index: true,
    },

    target: {
      type: String,
      default: null,
      index: true,
    },

    enforcement: {
      type: String,
      enum: Object.values(ControlPlaneEnforcement),
      required: true,
    },

    reason: {
      type: String,
      required: true,
      maxlength: 1024,
    },

    createdBy: {
      adminId: {
        type: String,
        required: true,
        index: true,
      },
      email: {
        type: String,
      },
    },

    expiresAt: {
      type: Date,
      default: null,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

/**
 * TTL index — exact expiry
 */
ControlPlaneControlSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
);

/**
 * Safety invariants enforced at schema level
 */
ControlPlaneControlSchema.pre("validate", function () {
  if (
    (this.scope === ControlPlaneScope.GLOBAL ||
      this.scope === ControlPlaneScope.EMERGENCY) &&
    this.target !== null
  ) {
    throw new Error(`${this.scope} controls must not define a target`);
  }

  if (
    this.scope === ControlPlaneScope.ACTION &&
    (!this.target || this.target.trim().length === 0)
  ) {
    throw new Error("ACTION controls must define a valid target");
  }
});

export const ControlPlaneControl: Model<ControlPlaneControlDocument> =
  mongoose.models.ControlPlaneControl ||
  mongoose.model<ControlPlaneControlDocument>(
    "ControlPlaneControl",
    ControlPlaneControlSchema
  );
