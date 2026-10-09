import { ClientSession, Types } from "mongoose";
import { UserProfile, UserProfileDocument } from "../models/userProfile.model";

export class UserProfileRepository {
  findByUserId(userId: Types.ObjectId, session: ClientSession) {
    return UserProfile.findOne({ userId }).session(session).exec();
  }

  createOwned(
    input: Omit<Partial<UserProfileDocument>, "_id"> & { userId: Types.ObjectId },
    session: ClientSession,
  ) {
    return UserProfile.create([input], { session }).then(([profile]) => profile);
  }

  updateOwnedAtVersion(input: {
    profileId: Types.ObjectId;
    userId: Types.ObjectId;
    expectedVersion: number;
    set: Record<string, unknown>;
    session: ClientSession;
  }) {
    // Older profiles can predate Mongoose's persisted version key. Treat a
    // missing key as version zero once, then establish normal __v semantics.
    const versionFilter = input.expectedVersion === 0
      ? { $or: [{ __v: 0 }, { __v: { $exists: false } }] }
      : { __v: input.expectedVersion };

    return UserProfile.findOneAndUpdate(
      { _id: input.profileId, userId: input.userId, ...versionFilter },
      { $set: input.set, $inc: { __v: 1 } },
      { new: true, session: input.session, runValidators: true },
    ).exec();
  }
}
export const userProfileRepository = new UserProfileRepository();
