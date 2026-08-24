import mongoose, { Document, Schema } from "mongoose";
import { FaceVerificationChallenge } from "./faceVerificationSession.model";

export type FaceVerificationEvidenceStatus = "UPLOADING" | "STORED" | "DELETE_PENDING" | "DELETED";

export interface FaceVerificationEvidenceDocument extends Document {
  evidenceReference: string;
  sessionId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  profileId: mongoose.Types.ObjectId;
  verificationRequestId?: mongoose.Types.ObjectId;
  challengeIndex: number;
  challenge: FaceVerificationChallenge;
  cloudinaryPublicId: string;
  cloudinaryResourceType: "image";
  mimeType?: string;
  bytes?: number;
  format?: string;
  status: FaceVerificationEvidenceStatus;
  captureReceivedAt?: Date;
  cleanupAfter?: Date;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<FaceVerificationEvidenceDocument>({
  evidenceReference: { type: String, required: true, unique: true, index: true, trim: true, maxlength: 96 },
  sessionId: { type: Schema.Types.ObjectId, ref: "FaceVerificationSession", required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  profileId: { type: Schema.Types.ObjectId, ref: "UserProfile", required: true, index: true },
  verificationRequestId: { type: Schema.Types.ObjectId, ref: "ProfileVerificationRequest", index: true },
  challengeIndex: { type: Number, required: true, min: 0, max: 4 },
  challenge: { type: String, required: true, enum: ["NEUTRAL", "TURN_LEFT", "TURN_RIGHT", "LOOK_UP", "LOOK_DOWN", "BLINK"] },
  cloudinaryPublicId: { type: String, required: true, unique: true, trim: true, maxlength: 240 },
  cloudinaryResourceType: { type: String, required: true, enum: ["image"], default: "image" },
  mimeType: { type: String, trim: true, maxlength: 80 },
  bytes: { type: Number, min: 1 },
  format: { type: String, trim: true, maxlength: 20 },
  status: { type: String, required: true, enum: ["UPLOADING", "STORED", "DELETE_PENDING", "DELETED"], default: "UPLOADING", index: true },
  captureReceivedAt: { type: Date }, cleanupAfter: { type: Date, index: true }, deletedAt: { type: Date },
}, { timestamps: true });

schema.index({ sessionId: 1, challengeIndex: 1 }, { unique: true, name: "one_face_evidence_per_session_challenge" });
schema.index({ status: 1, cleanupAfter: 1 });

export const FaceVerificationEvidence = mongoose.model<FaceVerificationEvidenceDocument>("FaceVerificationEvidence", schema);
