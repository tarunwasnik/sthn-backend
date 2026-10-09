import { ClientSession, Types } from "mongoose";
import { ProviderAssetEntityType } from "../enums/providerAsset.enums";
import { ProviderAssetGuard } from "../models/providerAssetGuard.model";
import { ProviderAssetReference } from "../models/providerAssetReference.model";
export class ProviderAssetReferenceRepository {
    async acquire(input: {
        guardId: Types.ObjectId;
        entityType: ProviderAssetEntityType;
        entityId: Types.ObjectId;
        slot: string;
        authoritativeReference: string;
        imageModerationAssetId?: Types.ObjectId;
        session: ClientSession;
    }) { const guard = await ProviderAssetGuard.findOneAndUpdate({ _id: input.guardId, state: "ACTIVE" }, { $inc: { generation: 1 } }, { new: true, session: input.session }).exec(); if (!guard)
        return null; try {
        const { session, ...document } = input;
        const reference = await ProviderAssetReference.create([{ ...document, state: "CURRENT", generation: guard.generation, acquiredAt: new Date() }], { session });
        const counted = await ProviderAssetGuard.findOneAndUpdate({ _id: input.guardId, state: "ACTIVE" }, { $inc: { currentReferenceCount: 1, generation: 1 } }, { new: true, session: input.session }).exec();
        if (!counted)
            throw Error("Guard changed during reference acquisition");
        return reference[0];
    }
    catch (error) {
        throw error;
    } }
    async release(input: {
        guardId: Types.ObjectId;
        entityType: ProviderAssetEntityType;
        entityId: Types.ObjectId;
        slot: string;
        session: ClientSession;
    }) { const guard = await ProviderAssetGuard.findOneAndUpdate({ _id: input.guardId, state: "ACTIVE", currentReferenceCount: { $gt: 0 } }, { $inc: { generation: 1 } }, { new: true, session: input.session }).exec(); if (!guard)
        return null; const { session, ...filter } = input; const reference = await ProviderAssetReference.findOneAndUpdate({ ...filter, state: "CURRENT" }, { $set: { state: "RELEASED", releasedAt: new Date(), generation: guard.generation } }, { new: true, session }).exec(); if (!reference)
        throw Error("Current provider reference is missing"); const counted = await ProviderAssetGuard.findOneAndUpdate({ _id: input.guardId, currentReferenceCount: { $gt: 0 } }, { $inc: { currentReferenceCount: -1, generation: 1 } }, { new: true, session: input.session }).exec(); if (!counted)
        throw Error("Provider reference count underflow"); return reference; }
    findCurrentByGuard(guardId: Types.ObjectId, session?: ClientSession) { return ProviderAssetReference.find({ guardId, state: "CURRENT" }).session(session ?? null).exec(); }
    findCurrentByEntity(entityType: ProviderAssetEntityType, entityId: Types.ObjectId, session?: ClientSession) { return ProviderAssetReference.find({ entityType, entityId, state: "CURRENT" }).session(session ?? null).exec(); }
}
export const providerAssetReferenceRepository = new ProviderAssetReferenceRepository();
