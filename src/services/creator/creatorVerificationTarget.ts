import { Types } from "mongoose";

export type VerificationTargetType = "USER_PROFILE" | "CREATOR_APPLICATION";
export type VerificationTarget = Readonly<{
  targetType: VerificationTargetType;
  targetId: Types.ObjectId;
  ownerUserId: Types.ObjectId;
  verificationRevision: number;
  avatarReference: string;
  avatarFingerprint: string;
}>;

export const sameVerificationTarget = (left: VerificationTarget, right: VerificationTarget) =>
  left.targetType === right.targetType
  && String(left.targetId) === String(right.targetId)
  && String(left.ownerUserId) === String(right.ownerUserId)
  && left.verificationRevision === right.verificationRevision
  && left.avatarReference === right.avatarReference
  && left.avatarFingerprint === right.avatarFingerprint;
