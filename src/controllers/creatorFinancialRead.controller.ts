import { Request, Response } from "express";
import { Types } from "mongoose";
import User from "../models/User";
import { CreatorProfile } from "../models/creatorProfile.model";
import { CreatorEntitlement } from "../models/creatorEntitlement.model";
import { CreatorEntitlementFinancialAllocation } from "../models/creatorEntitlementFinancialAllocation.model";
import { CreatorPayoutAuthorization } from "../models/creatorPayoutAuthorization.model";
import { Payout } from "../models/payout.model";
import { Booking } from "../models/booking.model";
import { resolveAccountGovernance } from "../services/accountGovernance/accountGovernanceResolver.service";

export const getCreatorSelfStatus = async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });
  const [user, profile] = await Promise.all([User.findById(req.user.id).lean(), CreatorProfile.findOne({ userId: req.user.id }).lean()]);
  if (!user || !profile) return res.status(404).json({ message: "Creator profile not found" });
  const governance = resolveAccountGovernance(user);
  return res.json({ status: { creatorStatus: profile.status, governanceState: user.governanceState, creatorCooldownUntil: user.creatorCooldownUntil ?? null, isCreatorCooldownActive: governance.isCreatorCooldownActive, blocksAcceptingBookings: governance.blocksAcceptingBookings } });
};

export const getCreatorEntitlements = async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });
  if (!Types.ObjectId.isValid(req.user.id)) return res.status(401).json({ message: "Unauthorized" });
  const creatorId = new Types.ObjectId(req.user.id);
  const requestedLimit = Number(req.query.limit);
  const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 100) : 50;
  const entitlements = await CreatorEntitlement.find({ creatorId }).sort({ createdAt: -1 }).limit(limit).lean();
  const ids = entitlements.map((item) => item._id);
  const [bookings, allocations, authorizations, payouts] = await Promise.all([
    Booking.find({ _id: { $in: entitlements.map((item) => item.bookingId) } }).select("bookingReference serviceTitle currency").lean(),
    CreatorEntitlementFinancialAllocation.find({ entitlementId: { $in: ids }, creatorId }).lean(),
    CreatorPayoutAuthorization.find({ entitlementId: { $in: ids }, creatorId }).lean(),
    Payout.find({ entitlementId: { $in: ids }, creatorId }).select("entitlementId status completedAt failedAt").lean(),
  ]);
  const bookingById = new Map(bookings.map((item) => [String(item._id), item])); const allocationById = new Map(allocations.map((item) => [String(item.entitlementId), item])); const authorizationById = new Map(authorizations.map((item) => [String(item.entitlementId), item])); const payoutById = new Map(payouts.map((item) => [String(item.entitlementId), item]));
  return res.json({ entitlements: entitlements.map((item) => { const allocation = allocationById.get(String(item._id)); const authorization = authorizationById.get(String(item._id)); const payout = payoutById.get(String(item._id)); const booking = bookingById.get(String(item.bookingId)); return { entitlementId: String(item._id), bookingReference: booking?.bookingReference ?? null, serviceTitle: booking?.serviceTitle ?? null, currency: item.currency, authorizedCreatorAmount: item.creatorAmount, approvedPayableAmount: allocation?.approvedCreatorAmount ?? item.creatorAmount, state: item.state, eligibleAt: item.eligibleAt ?? null, payoutAuthorization: authorization ? { state: authorization.state } : null, payout: payout ? { status: payout.status, completedAt: payout.completedAt ?? null, failedAt: payout.failedAt ?? null } : null }; }), page: { limit, returned: entitlements.length } });
};
