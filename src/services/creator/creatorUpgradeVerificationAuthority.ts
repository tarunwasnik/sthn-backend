import { Types } from "mongoose";
import { CreatorApplication } from "../../models/creatorApplication.model";
import { UserProfile } from "../../models/userProfile.model";
import { ProfileVerificationRequestDocument } from "../../models/profileVerificationRequest.model";
import { fingerprintProfileMediaReference } from "../profile/profileVerificationSubmittedMedia.service";

/** Do not accept direct-Creator or mismatched revisions into the shared worker. */
export async function isCurrentCreatorUpgradeVerification(request: ProfileVerificationRequestDocument): Promise<boolean> {
  if (request.targetType !== "CREATOR_APPLICATION" || !(request.targetId instanceof Types.ObjectId) || !(request.ownerUserId instanceof Types.ObjectId) || !Number.isInteger(request.verificationRevision) || !request.verificationRevision || request.verificationRevision < 1 || !request.userId.equals(request.ownerUserId) || request.profileSubmissionVersion !== request.verificationRevision || !request.submittedMedia) return false;
  const [application, userProfile] = await Promise.all([
    CreatorApplication.findOne({ _id: request.targetId, userId: request.ownerUserId, applicationJourney: "user_upgrade", verificationRevision: request.verificationRevision, status: { $in: ["submitted", "approved"] } }).lean(),
    UserProfile.exists({ userId: request.ownerUserId, profileStatus: "verified" }),
  ]);
  if (!application || !userProfile || !application.avatarUrl || !application.coverUrl) return false;
  const snapshot = request.submittedMedia;
  const media = application.media ?? [];
  return snapshot.avatar.sourceReference === application.avatarUrl && snapshot.avatar.fingerprint === fingerprintProfileMediaReference(application.avatarUrl)
    && snapshot.cover.sourceReference === application.coverUrl && snapshot.cover.fingerprint === fingerprintProfileMediaReference(application.coverUrl)
    && snapshot.profilePhotos.length === media.length && snapshot.profilePhotos.every((photo, index) => photo.profilePhotoIndex === index && photo.sourceReference === media[index] && photo.fingerprint === fingerprintProfileMediaReference(media[index]));
}
