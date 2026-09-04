import { ProfileVerificationProfileMediaShadowAnalysis } from "./profileVerificationInference.types";

type ShadowMedia = ProfileVerificationProfileMediaShadowAnalysis["media"][number];
export type ProfileVerificationGate2AvatarAdmission = "VALID_SINGLE_FACE" | "AVATAR_INVALID_NO_FACE" | "AVATAR_INVALID_FACE_UNUSABLE" | "AVATAR_INVALID_MULTIPLE_FACES" | "AVATAR_MEDIA_READ_FAILED";
export type ProfileVerificationGate2OptionalMediaAdmission = "NO_FACE_VALID" | "USABLE_FACE_EVIDENCE" | "FACE_EVIDENCE_UNUSABLE" | "MEDIA_READ_FAILED";
export type ProfileVerificationGate2MediaAdmission = {
  status: "READY_FOR_GATE3" | "AVATAR_INVALID" | "MEDIA_SNAPSHOT_UNAVAILABLE" | "LIVE_EVIDENCE_UNAVAILABLE";
  avatar?: { admission: ProfileVerificationGate2AvatarAdmission; detectedFaceCount: number; usableFaceCount: number };
  optionalMedia: Array<{ role: "COVER" | "PROFILE_PHOTO"; profilePhotoIndex?: number; admission: ProfileVerificationGate2OptionalMediaAdmission; detectedFaceCount: number; usableFaceCount: number }>;
};

const avatarAdmission = (media: ShadowMedia): ProfileVerificationGate2AvatarAdmission => {
  if (media.status === "MEDIA_READ_FAILED") return "AVATAR_MEDIA_READ_FAILED";
  if (media.status === "NO_FACE") return "AVATAR_INVALID_NO_FACE";
  if (media.usableFaceCount === 0) return "AVATAR_INVALID_FACE_UNUSABLE";
  if (media.usableFaceCount !== 1) return "AVATAR_INVALID_MULTIPLE_FACES";
  return "VALID_SINGLE_FACE";
};
const optionalAdmission = (media: ShadowMedia): ProfileVerificationGate2OptionalMediaAdmission => {
  if (media.status === "NO_FACE") return "NO_FACE_VALID";
  if (media.status === "FACE_CANDIDATES_AVAILABLE") return "USABLE_FACE_EVIDENCE";
  if (media.status === "MEDIA_READ_FAILED") return "MEDIA_READ_FAILED";
  return "FACE_EVIDENCE_UNUSABLE";
};

/**
 * Bounded role-aware Gate-2 interpretation of existing Y4B shadow output.
 * It does not evaluate identity scores and it is not a production authority.
 */
export const evaluateProfileVerificationGate2MediaAdmission = (analysis: ProfileVerificationProfileMediaShadowAnalysis): ProfileVerificationGate2MediaAdmission => {
  if (analysis.reasonCode === "MEDIA_SNAPSHOT_UNAVAILABLE") return { status: "MEDIA_SNAPSHOT_UNAVAILABLE", optionalMedia: [] };
  if (analysis.reasonCode === "INSUFFICIENT_USABLE_LIVE_CAPTURES") return { status: "LIVE_EVIDENCE_UNAVAILABLE", optionalMedia: [] };
  const avatar = analysis.media.find(media => media.role === "AVATAR");
  if (!avatar) return { status: "AVATAR_INVALID", avatar: { admission: "AVATAR_MEDIA_READ_FAILED", detectedFaceCount: 0, usableFaceCount: 0 }, optionalMedia: [] };
  const optionalMedia = analysis.media.filter((media): media is ShadowMedia & { role: "COVER" | "PROFILE_PHOTO" } => media.role !== "AVATAR").map(media => ({ role: media.role, ...(media.profilePhotoIndex === undefined ? {} : { profilePhotoIndex: media.profilePhotoIndex }), admission: optionalAdmission(media), detectedFaceCount: media.detectedFaceCount, usableFaceCount: media.usableFaceCount }));
  const admission = avatarAdmission(avatar);
  return { status: admission === "VALID_SINGLE_FACE" ? "READY_FOR_GATE3" : "AVATAR_INVALID", avatar: { admission, detectedFaceCount: avatar.detectedFaceCount, usableFaceCount: avatar.usableFaceCount }, optionalMedia };
};
