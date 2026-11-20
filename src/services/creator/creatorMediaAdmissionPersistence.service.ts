import { createHash } from "node:crypto";
import mongoose, { ClientSession, Types } from "mongoose";
import { ProviderAssetEntityType } from "../../enums/providerAsset.enums";
import { ImageAdmission } from "../../models/imageAdmission.model";
import { ImageModerationAsset } from "../../models/imageModerationAsset.model";
import { CreatorMediaCleanupIntent } from "../../models/creatorMediaCleanupIntent.model";
import { ProviderAssetReferenceDocument } from "../../models/providerAssetReference.model";
import { providerAssetReferenceRepository } from "../../repositories/providerAssetReference.repository";
import { imageAdmissionService } from "../imageModeration/imageAdmission.service";
import { providerAssetReferenceTransactionService, TrustedProviderAsset } from "../profile/providerAssetReferenceTransaction.service";
import { CreatorMediaClaim, CreatorMediaClaims, CreatorMediaResourceKind, creatorMediaSurfaces } from "./creatorMediaAdmissionContract";

export type CreatorAuthoritativeMedia = Readonly<{ avatar?: string | null; cover?: string | null; media: readonly string[] }>;
export type CreatorMediaResource = Readonly<{ id: Types.ObjectId; actorId: Types.ObjectId; media: CreatorAuthoritativeMedia }>;
export type CreatorMediaPersistenceContext = Readonly<{ session: ClientSession; resource: CreatorMediaResource; media: CreatorAuthoritativeMedia }>;
export type CreatorMediaPersistenceResult<TCommittedOutcome = undefined> = CreatorAuthoritativeMedia & { committedOutcome?: TCommittedOutcome };
export class CreatorMediaAdmissionPersistenceError extends Error { constructor(readonly code: "RESOURCE_NOT_FOUND" | "RESOURCE_OWNERSHIP" | "UNCHANGED_REFERENCE_INVALID" | "DUPLICATE_ADMISSION" | "UNSUPPORTED_SLOT") { super(code); this.name = "CreatorMediaAdmissionPersistenceError"; } }

const binding = (kind: CreatorMediaResourceKind, id: Types.ObjectId, slot: string) => `${kind}:${id.toString()}:${slot}`;
const entity = (kind: CreatorMediaResourceKind, id: Types.ObjectId, slot: string) => ({ entityType: kind as ProviderAssetEntityType, entityId: id, slot });
const referenceSlots = (media: CreatorAuthoritativeMedia) => [
  ...(media.avatar ? [{ slot: "avatar", reference: media.avatar }] : []),
  ...(media.cover ? [{ slot: "cover", reference: media.cover }] : []),
  ...media.media.map((reference, index) => ({ slot: `media:${index}`, reference })),
];
const eventKey = (kind: CreatorMediaResourceKind, id: Types.ObjectId, slot: string, reference: string) => `CREATOR_MEDIA:${kind}:${id}:${slot}:${createHash("sha256").update(reference).digest("hex")}`;

type Resolved = Readonly<{ reference: string; trusted?: TrustedProviderAsset }>;

/**
 * Generic server-only transaction boundary. Future controllers supply their
 * owned resource loader and persistence callback; this service controls all
 * media authority, admission consumption, provider references, and intents.
 */
export class CreatorMediaAdmissionPersistenceService {
  async persist<TCommittedOutcome = undefined>(input: Readonly<{
    actorId: Types.ObjectId; kind: CreatorMediaResourceKind; claims: CreatorMediaClaims;
    /** May create the resource in this transaction for a trusted initial workflow. */
    loadOwnedResource: (session: ClientSession) => Promise<CreatorMediaResource | null>;
    persistMedia: (context: CreatorMediaPersistenceContext) => Promise<TCommittedOutcome | void>;
  }>): Promise<CreatorMediaPersistenceResult<TCommittedOutcome>> {
    const session = await mongoose.startSession();
    try {
      let result: CreatorMediaPersistenceResult<TCommittedOutcome> | undefined;
      await session.withTransaction(async () => {
        const resource = await input.loadOwnedResource(session);
        if (!resource) throw new CreatorMediaAdmissionPersistenceError("RESOURCE_NOT_FOUND");
        if (String(resource.actorId) !== String(input.actorId)) throw new CreatorMediaAdmissionPersistenceError("RESOURCE_OWNERSHIP");
        const surfaces = creatorMediaSurfaces[input.kind];
        const original = resource.media;
        const consumed = new Set<string>();
        const resolve = async (claim: CreatorMediaClaim, surface: NonNullable<typeof surfaces.avatar>, slot: string, existing: readonly string[]): Promise<Resolved | null> => {
          if (claim.kind === "REMOVE") return null;
          if (claim.kind === "UNCHANGED") {
            if (!existing.includes(claim.reference)) throw new CreatorMediaAdmissionPersistenceError("UNCHANGED_REFERENCE_INVALID");
            return { reference: claim.reference };
          }
          if (consumed.has(claim.admissionReference)) throw new CreatorMediaAdmissionPersistenceError("DUPLICATE_ADMISSION");
          consumed.add(claim.admissionReference);
          const committed = await imageAdmissionService.consumeAdmissionReferenceInSession({ session, admissionReference: claim.admissionReference, actorId: input.actorId, expectedSurface: surface, destinationBinding: binding(input.kind, resource.id, slot) });
          const admission = await ImageAdmission.findOne({ admissionReference: claim.admissionReference, actorId: input.actorId, status: "CONSUMED", committedReference: binding(input.kind, resource.id, slot) }).session(session).exec();
          if (!admission) throw new Error("Consumed creator admission could not be resolved");
          const trusted = await providerAssetReferenceTransactionService.resolveTrustedCommittedAsset({ session, actorId: input.actorId, assetId: admission.assetId, destinationBinding: binding(input.kind, resource.id, slot) });
          if (trusted.authoritativeReference !== committed.trustedMediaReference) throw new Error("Creator admission reference does not match trusted asset provenance");
          return { reference: committed.trustedMediaReference, trusted };
        };
        const avatar = input.claims.avatar === undefined ? undefined : surfaces.avatar ? await resolve(input.claims.avatar, surfaces.avatar, "avatar", original.avatar ? [original.avatar] : []) : (() => { throw new CreatorMediaAdmissionPersistenceError("UNSUPPORTED_SLOT"); })();
        const cover = input.claims.cover === undefined ? undefined : surfaces.cover ? await resolve(input.claims.cover, surfaces.cover, "cover", original.cover ? [original.cover] : []) : (() => { throw new CreatorMediaAdmissionPersistenceError("UNSUPPORTED_SLOT"); })();
        const media = input.claims.media === undefined ? undefined : await Promise.all(input.claims.media.map((claim, index) => resolve(claim, surfaces.media, `media:${index}`, original.media)));
        if (media?.some((item) => item === null)) throw new CreatorMediaAdmissionPersistenceError("UNSUPPORTED_SLOT");
        const next: CreatorAuthoritativeMedia = { avatar: avatar === undefined ? original.avatar : avatar?.reference ?? null, cover: cover === undefined ? original.cover : cover?.reference ?? null, media: media?.map((item) => item!.reference) ?? [...original.media] };
        const desired = [
          ...(next.avatar ? [{ slot: "avatar", resolved: avatar ?? { reference: next.avatar } }] : []),
          ...(next.cover ? [{ slot: "cover", resolved: cover ?? { reference: next.cover } }] : []),
          ...next.media.map((reference, index) => ({ slot: `media:${index}`, resolved: media?.[index]! ?? { reference } })),
        ];
        const current = await providerAssetReferenceRepository.findCurrentByEntity(input.kind as ProviderAssetEntityType, resource.id, session);
        const retained = new Set(desired.filter((wanted) => !wanted.resolved.trusted && current.some((existing) => existing.slot === wanted.slot && existing.authoritativeReference === wanted.resolved.reference)).map((wanted) => wanted.slot));
        for (const slot of retained) { const existing = current.find((reference) => reference.slot === slot)!; await providerAssetReferenceTransactionService.retainUnchanged({ session, entity: entity(input.kind, resource.id, slot), guardId: existing.guardId, authoritativeReference: existing.authoritativeReference }); }
        const released: ProviderAssetReferenceDocument[] = [];
        for (const existing of current) {
          const wanted = desired.find((candidate) => candidate.slot === existing.slot);
          if (wanted && !wanted.resolved.trusted && wanted.resolved.reference === existing.authoritativeReference) continue;
          released.push((await providerAssetReferenceTransactionService.releaseFormer({ session, entity: entity(input.kind, resource.id, existing.slot), former: existing })).released);
        }
        for (const wanted of desired) {
          if (retained.has(wanted.slot)) continue;
          if (wanted.resolved.trusted) { await providerAssetReferenceTransactionService.acquireTrusted({ session, entity: entity(input.kind, resource.id, wanted.slot), trusted: wanted.resolved.trusted }); continue; }
          const former = released.find((reference) => reference.authoritativeReference === wanted.resolved.reference);
          if (former) await providerAssetReferenceTransactionService.restoreReleased({ session, entity: entity(input.kind, resource.id, wanted.slot), former });
        }
        const committedOutcome = await input.persistMedia({ session, resource, media: next });
        const remainingReferences = new Set(referenceSlots(next).map((item) => item.reference));
        for (const former of released) {
          if (remainingReferences.has(former.authoritativeReference)) continue;
          if ((await providerAssetReferenceRepository.findCurrentByGuard(former.guardId, session)).length) continue;
          const asset = former.imageModerationAssetId ? await ImageModerationAsset.findOne({ _id: former.imageModerationAssetId, actorId: input.actorId, trustedMediaReference: former.authoritativeReference, status: "COMMITTED" }).session(session).exec() : null;
          if (!asset) continue; // legacy/unproven URLs are deliberately never destructive-cleanup eligible.
          await CreatorMediaCleanupIntent.updateOne({ eventKey: eventKey(input.kind, resource.id, former.slot, former.authoritativeReference) }, { $setOnInsert: { eventKey: eventKey(input.kind, resource.id, former.slot, former.authoritativeReference), actorId: input.actorId, entityType: input.kind, entityId: resource.id, slot: former.slot, formerReference: former.authoritativeReference, providerAssetId: asset.providerAssetId } }, { upsert: true, session }).exec();
        }
        result = { ...next, ...(committedOutcome === undefined ? {} : { committedOutcome }) };
      });
      if (!result) throw new Error("Creator media transaction did not produce a result");
      return result;
    } finally { await session.endSession(); }
  }
}
export const creatorMediaAdmissionPersistenceService = new CreatorMediaAdmissionPersistenceService();
