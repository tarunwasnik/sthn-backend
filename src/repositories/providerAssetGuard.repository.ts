import { ClientSession, Types } from "mongoose";
import { ProviderAssetGuard } from "../models/providerAssetGuard.model";
import { ProviderAssetReference } from "../models/providerAssetReference.model";
export class ProviderAssetGuardRepository {
    findByProviderAssetId(providerAssetId: string, session?: ClientSession) { return ProviderAssetGuard.findOne({ provider: "CLOUDINARY", resourceType: "image", providerAssetId }).session(session ?? null).exec(); }
    async locateTrusted(input: {
        providerAssetId: string;
        session: ClientSession;
    }) { let guard = await ProviderAssetGuard.findOne({ provider: "CLOUDINARY", resourceType: "image", providerAssetId: input.providerAssetId }).session(input.session).exec(); if (guard)
        return guard; try {
        [guard] = await ProviderAssetGuard.create([{ provider: "CLOUDINARY", resourceType: "image", providerAssetId: input.providerAssetId }], { session: input.session });
        return guard;
    }
    catch (error) {
        if (!(typeof error === "object" && error !== null && "code" in error && (error as {
            code?: unknown;
        }).code === 11000))
            throw error;
        const concurrent = await ProviderAssetGuard.findOne({ provider: "CLOUDINARY", resourceType: "image", providerAssetId: input.providerAssetId }).session(input.session).exec();
        if (!concurrent)
            throw error;
        return concurrent;
    } }
    async reserveDeletion(input: {
        guardId: Types.ObjectId;
        jobId: Types.ObjectId;
        token: string;
        expiresAt: Date;
        session: ClientSession;
    }) {
        if (!input.session.inTransaction()) throw new Error("Provider asset deletion reservation requires an active transaction");
        if (!input.token.trim()) throw new Error("Provider asset deletion reservation token is required");
        const current = await ProviderAssetReference.exists({ guardId: input.guardId, state: "CURRENT" }).session(input.session);
        if (current) return null;
        return ProviderAssetGuard.findOneAndUpdate({ _id: input.guardId, state: "ACTIVE", currentReferenceCount: 0 }, { $set: { state: "DELETE_RESERVED", reservationJobId: input.jobId, reservationToken: input.token, reservationExpiresAt: input.expiresAt }, $inc: { generation: 1 } }, { new: true, session: input.session }).exec();
    }
    startDeletion(input: {
        guardId: Types.ObjectId;
        token: string;
        now: Date;
        session: ClientSession;
    }) { return ProviderAssetGuard.findOneAndUpdate({ _id: input.guardId, state: "DELETE_RESERVED", reservationToken: input.token }, { $set: { state: "DELETE_IN_PROGRESS", deletionStartedAt: input.now }, $inc: { generation: 1 } }, { new: true, session: input.session }).exec(); }
    markUnknown(input: {
        guardId: Types.ObjectId;
        token: string;
        session: ClientSession;
    }) { return ProviderAssetGuard.findOneAndUpdate({ _id: input.guardId, state: "DELETE_IN_PROGRESS", reservationToken: input.token }, { $set: { state: "DELETE_UNKNOWN", providerOutcome: "UNKNOWN" }, $inc: { generation: 1 } }, { new: true, session: input.session }).exec(); }
    markDeleted(input: {
        guardId: Types.ObjectId;
        token: string;
        now: Date;
        outcome: "DELETED" | "ALREADY_MISSING";
        session: ClientSession;
    }) { return ProviderAssetGuard.findOneAndUpdate({ _id: input.guardId, state: "DELETE_IN_PROGRESS", reservationToken: input.token }, { $set: { state: "DELETED", deletedAt: input.now, providerOutcome: input.outcome }, $inc: { generation: 1 } }, { new: true, session: input.session }).exec(); }
    releaseRetryableDeletion(input: {
        guardId: Types.ObjectId;
        token: string;
        session: ClientSession;
    }) { return ProviderAssetGuard.findOneAndUpdate({ _id: input.guardId, state: "DELETE_IN_PROGRESS", reservationToken: input.token, currentReferenceCount: 0 }, { $set: { state: "ACTIVE" }, $unset: { reservationJobId: 1, reservationToken: 1, reservationExpiresAt: 1, deletionStartedAt: 1 }, $inc: { generation: 1 } }, { new: true, session: input.session }).exec(); }
    recoverExpiredReservation(input: {
        guardId: Types.ObjectId;
        now: Date;
        session: ClientSession;
    }) { return ProviderAssetGuard.findOneAndUpdate({ _id: input.guardId, state: "DELETE_RESERVED", reservationExpiresAt: { $lte: input.now }, deletionStartedAt: { $exists: false } }, { $set: { state: "ACTIVE" }, $unset: { reservationJobId: 1, reservationToken: 1, reservationExpiresAt: 1 }, $inc: { generation: 1 } }, { new: true, session: input.session }).exec(); }
    listExpiredReservations(now: Date, limit = 100) { return ProviderAssetGuard.find({ state: "DELETE_RESERVED", reservationExpiresAt: { $lte: now }, deletionStartedAt: { $exists: false } }).sort({ reservationExpiresAt: 1 }).limit(limit).exec(); }
    listExpiredInProgress(now: Date, limit = 100) { return ProviderAssetGuard.find({ state: "DELETE_IN_PROGRESS", reservationExpiresAt: { $lte: now } }).sort({ reservationExpiresAt: 1 }).limit(limit).exec(); }
    listBlocked() { return ProviderAssetGuard.find({ state: { $in: ["DELETE_IN_PROGRESS", "DELETE_UNKNOWN"] } }).exec(); }
}
export const providerAssetGuardRepository = new ProviderAssetGuardRepository();
