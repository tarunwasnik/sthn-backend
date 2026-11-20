import { ClientSession, Types } from "mongoose";
import User from "../../models/User";
import { CreatorCustomerBlock } from "../../models/creatorCustomerBlock.model";
import { CreatorProfile } from "../../models/creatorProfile.model";
import { UserProfile } from "../../models/userProfile.model";
import { ROLES } from "../../constants/roles";
import { AppError } from "../../utils/AppError";

const objectId = (value: string, field: string) => {
  if (!Types.ObjectId.isValid(value)) throw new AppError(`Invalid ${field}`, 400);
  return new Types.ObjectId(value);
};

export const assertCreatorBookingAdmission = async (input: {
  creatorId: Types.ObjectId;
  customerId: Types.ObjectId;
  session?: ClientSession;
}) => {
  const [creator, blocked] = await Promise.all([
    CreatorProfile.findOne({ userId: input.creatorId }).session(input.session ?? null).select("status acceptingNewBookings").lean(),
    CreatorCustomerBlock.exists({ creatorId: input.creatorId, customerId: input.customerId }).session(input.session ?? null),
  ]);
  if (!creator || creator.status !== "active" || !creator.acceptingNewBookings || blocked) {
    throw new AppError("This creator is currently unable to receive new booking requests.", 403, "CREATOR_UNAVAILABLE");
  }
  // A booking transaction writes this same document. Safety changes also
  // increment it, making a concurrent block/pause produce a transaction
  // conflict rather than a stale successful booking admission.
  if (input.session?.inTransaction()) {
    const locked = await CreatorProfile.findOneAndUpdate(
      { userId: input.creatorId, status: "active", acceptingNewBookings: true },
      { $inc: { bookingAdmissionRevision: 1 } },
      { new: true, session: input.session },
    ).lean();
    if (!locked) throw new AppError("This creator is currently unable to receive new booking requests.", 403, "CREATOR_UNAVAILABLE");
  }
};

export const getCreatorBookingSafety = async (creatorId: string) => {
  const creator = await CreatorProfile.findOne({ userId: objectId(creatorId, "creator identity") }).select("acceptingNewBookings").lean();
  if (!creator) throw new AppError("Creator profile not found", 404);
  const blocks = await CreatorCustomerBlock.find({ creatorId: objectId(creatorId, "creator identity") }).sort({ createdAt: -1 }).lean();
  const customerIds = blocks.map((block) => block.customerId);
  const profiles = await UserProfile.find({ userId: { $in: customerIds } }).select("userId username avatar").lean();
  const profileByUser = new Map(profiles.map((profile) => [String(profile.userId), profile]));
  return {
    acceptingNewBookings: creator.acceptingNewBookings,
    blockedCustomers: blocks.map((block) => {
      const profile = profileByUser.get(String(block.customerId));
      return { id: String(block.customerId), username: profile?.username ?? "Customer", avatarUrl: profile?.avatar ?? null, blockedAt: block.createdAt };
    }),
  };
};

export const updateCreatorBookingAvailability = async (creatorId: string, acceptingNewBookings: unknown) => {
  if (typeof acceptingNewBookings !== "boolean") throw new AppError("acceptingNewBookings must be a boolean", 400);
  const creator = await CreatorProfile.findOneAndUpdate(
    { userId: objectId(creatorId, "creator identity"), status: "active" },
    { $set: { acceptingNewBookings }, $inc: { bookingAdmissionRevision: 1 } },
    { new: true, runValidators: true },
  ).select("acceptingNewBookings").lean();
  if (!creator) throw new AppError("Active Creator profile not found", 404);
  return creator.acceptingNewBookings;
};

export const blockCreatorCustomer = async (creatorId: string, customerId: string) => {
  const creator = objectId(creatorId, "creator identity");
  const customer = objectId(customerId, "customer identity");
  if (creator.equals(customer)) throw new AppError("You cannot block yourself", 400);
  const target = await User.findOne({ _id: customer, role: ROLES.USER }).select("_id").lean();
  if (!target) throw new AppError("Customer not found", 404);
  const session = await CreatorCustomerBlock.startSession();
  try {
    await session.withTransaction(async () => {
      await CreatorCustomerBlock.create([{ creatorId: creator, customerId: customer }], { session });
      const updated = await CreatorProfile.updateOne({ userId: creator, status: "active" }, { $inc: { bookingAdmissionRevision: 1 } }, { session });
      if (!updated.matchedCount) throw new AppError("Active Creator profile not found", 404);
    });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw new AppError("Customer is already blocked", 409);
    throw error;
  } finally {
    await session.endSession();
  }
};

export const unblockCreatorCustomer = async (creatorId: string, customerId: string) => {
  const creator = objectId(creatorId, "creator identity");
  const customer = objectId(customerId, "customer identity");
  const session = await CreatorCustomerBlock.startSession();
  try {
    await session.withTransaction(async () => {
      const result = await CreatorCustomerBlock.deleteOne({ creatorId: creator, customerId: customer }, { session });
      if (!result.deletedCount) throw new AppError("Blocked customer not found", 404);
      await CreatorProfile.updateOne({ userId: creator }, { $inc: { bookingAdmissionRevision: 1 } }, { session });
    });
  } finally {
    await session.endSession();
  }
};
