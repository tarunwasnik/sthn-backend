import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import express from "express";
import mongoose, { Types } from "mongoose";

import { createCreatorService, deleteCreatorService, updateCreatorService } from "../../controllers/creatorService.controller";
import { errorHandler } from "../../middlewares/errorHandler";
import { notFound } from "../../middlewares/notFound";
import { Booking } from "../../models/booking.model";
import { CreatorMediaCleanupIntent } from "../../models/creatorMediaCleanupIntent.model";
import { CreatorProfile } from "../../models/creatorProfile.model";
import { CreatorService } from "../../models/creatorService.model";
import { ImageAdmission } from "../../models/imageAdmission.model";
import { ImageModerationAsset } from "../../models/imageModerationAsset.model";
import { ImageModerationAttempt } from "../../models/imageModerationAttempt.model";
import { ProviderAssetReference } from "../../models/providerAssetReference.model";
import { creatorMediaAdmissionPersistenceService } from "../../services/creator/creatorMediaAdmissionPersistence.service";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";

const sha = "a".repeat(64);
const future = () => new Date(Date.now() + 60_000);
const admissionClaim = (admissionReference: string) => ({ kind: "ADMISSION", admissionReference });
const unchanged = (reference: string) => ({ kind: "UNCHANGED", reference });

async function seedCreator(id = new Types.ObjectId()) {
  await CreatorProfile.create({ userId: id, slug: `service-creator-${id}`, displayName: "Creator", primaryCategory: "Music", country: "IN", city: "Delhi", currency: "INR", status: "active" });
  return id;
}

async function seedAdmission(actorId: Types.ObjectId, reference: string, options: { surface?: "CREATOR_SERVICE_MEDIA"; expiresAt?: Date; status?: "PASSED" | "BLOCKED" | "UNAVAILABLE" } = {}) {
  const expiresAt = options.expiresAt ?? future();
  const asset = await ImageModerationAsset.create({ assetReference: `ima_${new Types.ObjectId()}`, actorId, contentSha256: sha, providerAssetId: `creator/service-${new Types.ObjectId()}`, trustedMediaReference: reference, expiresAt, retentionDeadline: future() });
  const attempt = await ImageModerationAttempt.create({ attemptReference: `imat_${new Types.ObjectId()}`, assetId: asset._id, actorId, contentSha256: sha, surface: options.surface ?? "CREATOR_SERVICE_MEDIA", entityBinding: `PENDING:${actorId}:CREATOR_SERVICE_MEDIA`, status: options.status ?? "PASSED", provenanceModel: { identifier: "test", revision: "test", artifactSha256: sha }, policy: { key: "TEST", version: "V1" }, expiresAt, retentionDeadline: future() });
  const admission = await ImageAdmission.create({ admissionReference: `imauth_${new Types.ObjectId()}`, attemptId: attempt._id, assetId: asset._id, actorId, contentSha256: sha, surface: options.surface ?? "CREATOR_SERVICE_MEDIA", entityBinding: attempt.entityBinding, expiresAt });
  return { asset, attempt, admission };
}

async function startServer() {
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { const actor = req.header("x-actor"); if (actor) req.user = { id: actor, role: "creator" } as never; next(); });
  app.post("/services", createCreatorService); app.patch("/services/:serviceId", updateCreatorService); app.delete("/services/:serviceId", deleteCreatorService);
  app.use(notFound); app.use(errorHandler);
  const server = http.createServer(app); await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("test server did not bind");
  return { url: `http://127.0.0.1:${address.port}`, close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}

const body = (actor: Types.ObjectId, value: unknown) => ({ method: "POST", headers: { "content-type": "application/json", "x-actor": actor.toString() }, body: JSON.stringify(value) });
const createPayload = (media: unknown) => ({ title: "Portrait session", description: "A carefully moderated service.", durationMinutes: 60, price: 1200, media });

async function withPersistMediaFailure(work: () => Promise<void>, message: string, afterPersist = false) {
  const original = creatorMediaAdmissionPersistenceService.persist.bind(creatorMediaAdmissionPersistenceService);
  Object.defineProperty(creatorMediaAdmissionPersistenceService, "persist", {
    configurable: true,
    value: async (input: Parameters<typeof creatorMediaAdmissionPersistenceService.persist>[0]) => original({
      ...input,
      persistMedia: async (context) => {
        if (!afterPersist) throw new Error(message);
        await input.persistMedia(context);
        throw new Error(message);
      },
    }),
  });
  try { await work(); }
  finally { Object.defineProperty(creatorMediaAdmissionPersistenceService, "persist", { configurable: true, value: original }); }
}

async function withStaticFailure(target: object, key: string, work: () => Promise<void>, message: string) {
  const original = Reflect.get(target, key);
  Object.defineProperty(target, key, { configurable: true, value: () => { throw new Error(message); } });
  try { await work(); }
  finally { Object.defineProperty(target, key, { configurable: true, value: original }); }
}

test.before(async () => { process.env.NODE_ENV = "test"; await connectPhase7HDatabase(); });
test.beforeEach(clearPhase7HDatabase); test.after(disconnectPhase7HDatabase);

test("Creator Service routes consume only caller-owned CREATOR_SERVICE_MEDIA admissions and preserve exact unchanged media", async () => {
  const actor = await seedCreator(); const first = await seedAdmission(actor, "https://trusted.test/service-a"); const server = await startServer();
  try {
    const created = await fetch(`${server.url}/services`, body(actor, createPayload([admissionClaim(first.admission.admissionReference)])));
    assert.equal(created.status, 201); const createdJson = await created.json() as { service: { _id: string } };
    const service = await CreatorService.findById(createdJson.service._id).orFail();
    assert.deepEqual(service.media, ["https://trusted.test/service-a"]);
    assert.equal((await ImageAdmission.findById(first.admission._id).orFail()).status, "CONSUMED");
    assert.equal(await ProviderAssetReference.countDocuments({ entityType: "CREATOR_SERVICE", entityId: service._id, state: "CURRENT" }), 1);

    const update = await fetch(`${server.url}/services/${service._id}`, { ...body(actor, { title: "Renamed", media: [unchanged("https://trusted.test/service-a")] }), method: "PATCH" });
    assert.equal(update.status, 200); assert.equal((await CreatorService.findById(service._id).orFail()).title, "Renamed");
    assert.deepEqual((await CreatorService.findById(service._id).orFail()).media, ["https://trusted.test/service-a"]);

    const ordinaryUpdate = await fetch(`${server.url}/services/${service._id}`, { ...body(actor, { description: "Edited without changing media" }), method: "PATCH" });
    assert.equal(ordinaryUpdate.status, 200);
    assert.deepEqual((await CreatorService.findById(service._id).orFail()).media, ["https://trusted.test/service-a"]);

    const raw = await fetch(`${server.url}/services/${service._id}`, { ...body(actor, { media: ["https://raw.test/bypass"] }), method: "PATCH" });
    const forged = await fetch(`${server.url}/services/${service._id}`, { ...body(actor, { media: [unchanged("https://forged.test/media")] }), method: "PATCH" });
    assert.equal(raw.status, 400); assert.equal(forged.status, 400);
  } finally { await server.close(); }
});

test("Creator Service creation requires one ADMISSION claim and rejects empty, multiple, and unchanged media", async () => {
  const actor = await seedCreator();
  const first = await seedAdmission(actor, "https://trusted.test/required-one");
  const second = await seedAdmission(actor, "https://trusted.test/required-two");
  const server = await startServer();
  try {
    for (const media of [undefined, [], [unchanged("https://trusted.test/required-one")], [admissionClaim(first.admission.admissionReference), admissionClaim(second.admission.admissionReference)]]) {
      const response = await fetch(`${server.url}/services`, body(actor, createPayload(media)));
      assert.equal(response.status, 400);
    }
    assert.equal(await CreatorService.countDocuments({ creatorId: actor }), 0);
    assert.equal((await ImageAdmission.findById(first.admission._id).orFail()).status, "ACTIVE");
    assert.equal((await ImageAdmission.findById(second.admission._id).orFail()).status, "ACTIVE");
    assert.equal(await ProviderAssetReference.countDocuments(), 0);
  } finally { await server.close(); }
});

test("Creator Service route rejects wrong ownership, wrong authority state, expiry, and replay without persistence", async () => {
  const actor = await seedCreator(); const other = await seedCreator(); const server = await startServer();
  try {
    const foreign = await seedAdmission(other, "https://trusted.test/foreign");
    const expired = await seedAdmission(actor, "https://trusted.test/expired", { expiresAt: new Date(Date.now() - 1) });
    const blocked = await seedAdmission(actor, "https://trusted.test/blocked", { status: "BLOCKED" });
    for (const admission of [foreign, expired, blocked]) {
      const response = await fetch(`${server.url}/services`, body(actor, createPayload([admissionClaim(admission.admission.admissionReference)])));
      assert.equal(response.status, 400); assert.equal((await ImageAdmission.findById(admission.admission._id).orFail()).status, "ACTIVE");
    }
    assert.equal(await CreatorService.countDocuments({ creatorId: actor }), 0);
    assert.equal(await ProviderAssetReference.countDocuments(), 0);
    assert.equal(await CreatorMediaCleanupIntent.countDocuments(), 0);
    const valid = await seedAdmission(actor, "https://trusted.test/once");
    const first = await fetch(`${server.url}/services`, body(actor, createPayload([admissionClaim(valid.admission.admissionReference)])));
    assert.equal(first.status, 201);
    const replay = await fetch(`${server.url}/services`, body(actor, createPayload([admissionClaim(valid.admission.admissionReference)])));
    assert.equal(replay.status, 400);
    const service = await CreatorService.findOne({ creatorId: actor }).orFail();
    const crossCreator = await fetch(`${server.url}/services/${service._id}`, { ...body(other, { title: "stolen", media: [unchanged(service.media![0])] }), method: "PATCH" });
    assert.equal(crossCreator.status, 404); assert.equal((await CreatorService.findById(service._id).orFail()).title, "Portrait session");
    assert.equal(await CreatorService.countDocuments({ creatorId: actor }), 1);
    assert.equal(await ProviderAssetReference.countDocuments({ entityType: "CREATOR_SERVICE", entityId: service._id, state: "CURRENT" }), 1);
    assert.equal(await CreatorMediaCleanupIntent.countDocuments({ entityType: "CREATOR_SERVICE", entityId: service._id }), 0);
  } finally { await server.close(); }
});

test("Creator Service update atomically replaces its single image and releases only the tracked former media after commit", async () => {
  const actor = await seedCreator(); const first = await seedAdmission(actor, "https://trusted.test/one"); const replacement = await seedAdmission(actor, "https://trusted.test/three"); const server = await startServer();
  try {
    const create = await fetch(`${server.url}/services`, body(actor, createPayload([admissionClaim(first.admission.admissionReference)])));
    const { service: created } = await create.json() as { service: { _id: string } };
    const update = await fetch(`${server.url}/services/${created._id}`, { ...body(actor, { media: [admissionClaim(replacement.admission.admissionReference)] }), method: "PATCH" });
    assert.equal(update.status, 200);
    const service = await CreatorService.findById(created._id).orFail(); assert.deepEqual(service.media, ["https://trusted.test/three"]);
    assert.equal((await ImageAdmission.findById(replacement.admission._id).orFail()).status, "CONSUMED");
    assert.equal(await ProviderAssetReference.countDocuments({ entityType: "CREATOR_SERVICE", entityId: service._id, state: "CURRENT" }), 1);
    assert.equal(await CreatorMediaCleanupIntent.countDocuments({ entityType: "CREATOR_SERVICE", entityId: service._id, formerReference: "https://trusted.test/one" }), 1);
  } finally { await server.close(); }
});

test("Legacy multi-image Creator Services preserve media on ordinary edits and reject media migration claims", async () => {
  const actor = await seedCreator(); const server = await startServer();
  const legacyMedia = ["https://legacy.test/one.jpg", "https://legacy.test/two.jpg"];
  const legacy = await CreatorService.create({ creatorId: actor, title: "Legacy service", description: "Keep every historic image", durationMinutes: 30, price: 500, currency: "INR", isActive: true, media: legacyMedia });
  try {
    const ordinary = await fetch(`${server.url}/services/${legacy._id}`, { ...body(actor, { title: "Legacy non-media edit" }), method: "PATCH" });
    assert.equal(ordinary.status, 200);
    assert.deepEqual((await CreatorService.findById(legacy._id).orFail()).media, legacyMedia);

    const mediaBearing = await fetch(`${server.url}/services/${legacy._id}`, { ...body(actor, { media: [unchanged(legacyMedia[0])] }), method: "PATCH" });
    assert.equal(mediaBearing.status, 409);
    assert.deepEqual((await CreatorService.findById(legacy._id).orFail()).media, legacyMedia);
    assert.equal(await CreatorMediaCleanupIntent.countDocuments({ entityType: "CREATOR_SERVICE", entityId: legacy._id }), 0);
  } finally { await server.close(); }
});

test("Creator Service deletion is owned, transactional, release-only, and preserves historical booking snapshots", async () => {
  const actor = await seedCreator(); const other = await seedCreator(); const admitted = await seedAdmission(actor, "https://trusted.test/historical"); const server = await startServer();
  try {
    const create = await fetch(`${server.url}/services`, body(actor, createPayload([admissionClaim(admitted.admission.admissionReference)])));
    const { service: created } = await create.json() as { service: { _id: string } };
    const service = await CreatorService.findById(created._id).orFail();
    await Booking.collection.insertOne({ _id: new Types.ObjectId(), serviceId: service._id, creatorId: actor, userId: new Types.ObjectId(), slotIds: [], serviceTitle: service.title, description: service.description, durationMinutes: service.durationMinutes, price: service.price, currency: service.currency, serviceAmount: 1, platformFeeAmount: 0, commissionAmount: 0, creatorAmount: 1, totalAmount: 1, status: "COMPLETED", paymentStatus: "PAID", isPayable: true, isPayoutEligible: false, isFinancialLocked: false, expiresAt: new Date(), hasInteracted: true, lifecycleVersion: 0, serviceSnapshot: { serviceId: service._id, title: service.title, description: service.description, durationMinutes: service.durationMinutes, price: service.price, currency: service.currency, media: ["https://trusted.test/historical"] } });
    const forbidden = await fetch(`${server.url}/services/${service._id}`, { method: "DELETE", headers: { "x-actor": other.toString() } }); assert.equal(forbidden.status, 404);
    const deleted = await fetch(`${server.url}/services/${service._id}`, { method: "DELETE", headers: { "x-actor": actor.toString() } }); assert.equal(deleted.status, 200);
    assert.equal(await CreatorService.exists({ _id: service._id }), null);
    assert.deepEqual((await Booking.findOne({ serviceId: service._id }).lean())?.serviceSnapshot?.media, ["https://trusted.test/historical"]);
    assert.equal(await ProviderAssetReference.countDocuments({ entityType: "CREATOR_SERVICE", entityId: service._id, state: "CURRENT" }), 0);
    assert.equal(await CreatorMediaCleanupIntent.countDocuments({ entityType: "CREATOR_SERVICE", entityId: service._id }), 0);
    const legacy = await CreatorService.create({ creatorId: actor, title: "Legacy service", description: "Legacy image retention", durationMinutes: 30, price: 500, currency: "INR", isActive: true, media: ["https://legacy.test/service.jpg"] });
    const deletedLegacy = await fetch(`${server.url}/services/${legacy._id}`, { method: "DELETE", headers: { "x-actor": actor.toString() } });
    assert.equal(deletedLegacy.status, 200); assert.equal(await CreatorService.exists({ _id: legacy._id }), null);
    assert.equal(await CreatorMediaCleanupIntent.countDocuments({ entityType: "CREATOR_SERVICE", entityId: legacy._id }), 0);
  } finally { await server.close(); }
});

test("Creator Service create rolls back a consumed admission and provisional service when persistence fails", async () => {
  const actor = await seedCreator(); const admitted = await seedAdmission(actor, "https://trusted.test/create-rollback"); const server = await startServer();
  try {
    await withPersistMediaFailure(async () => {
      const response = await fetch(`${server.url}/services`, body(actor, createPayload([admissionClaim(admitted.admission.admissionReference)])));
      assert.equal(response.status, 400);
    }, "injected create persistence failure");
    assert.equal(await CreatorService.countDocuments({ creatorId: actor }), 0);
    assert.equal((await ImageAdmission.findById(admitted.admission._id).orFail()).status, "ACTIVE");
    assert.equal(await ProviderAssetReference.countDocuments(), 0);
    assert.equal(await CreatorMediaCleanupIntent.countDocuments(), 0);
    assert.equal(await CreatorProfile.countDocuments({ userId: actor, status: "active" }), 1);
  } finally { await server.close(); }
});

test("Creator Service replacement rolls back media, references, and cleanup intent after persistence failure", async () => {
  const actor = await seedCreator(); const original = await seedAdmission(actor, "https://trusted.test/original"); const replacement = await seedAdmission(actor, "https://trusted.test/replacement-rollback"); const server = await startServer();
  try {
    const created = await fetch(`${server.url}/services`, body(actor, createPayload([admissionClaim(original.admission.admissionReference)])));
    assert.equal(created.status, 201); const { service: responseService } = await created.json() as { service: { _id: string } };
    await withPersistMediaFailure(async () => {
      const response = await fetch(`${server.url}/services/${responseService._id}`, { ...body(actor, { title: "Must not persist", media: [admissionClaim(replacement.admission.admissionReference)] }), method: "PATCH" });
      assert.equal(response.status, 400);
    }, "injected update persistence failure", true);
    const service = await CreatorService.findById(responseService._id).orFail();
    assert.equal(service.title, "Portrait session"); assert.deepEqual(service.media, ["https://trusted.test/original"]);
    assert.equal((await ImageAdmission.findById(replacement.admission._id).orFail()).status, "ACTIVE");
    assert.deepEqual((await ProviderAssetReference.find({ entityType: "CREATOR_SERVICE", entityId: service._id, state: "CURRENT" }).lean()).map((reference) => reference.authoritativeReference), ["https://trusted.test/original"]);
    assert.equal(await CreatorMediaCleanupIntent.countDocuments({ entityType: "CREATOR_SERVICE", entityId: service._id }), 0);
  } finally { await server.close(); }
});

test("Creator Service cleanup-intent failure rolls back a committed-media replacement", async () => {
  const actor = await seedCreator(); const original = await seedAdmission(actor, "https://trusted.test/intent-original"); const replacement = await seedAdmission(actor, "https://trusted.test/intent-replacement"); const server = await startServer();
  try {
    const created = await fetch(`${server.url}/services`, body(actor, createPayload([admissionClaim(original.admission.admissionReference)])));
    assert.equal(created.status, 201); const { service: responseService } = await created.json() as { service: { _id: string } };
    await withStaticFailure(CreatorMediaCleanupIntent, "updateOne", async () => {
      const response = await fetch(`${server.url}/services/${responseService._id}`, { ...body(actor, { media: [admissionClaim(replacement.admission.admissionReference)] }), method: "PATCH" });
      assert.equal(response.status, 400);
    }, "injected cleanup intent failure");
    const service = await CreatorService.findById(responseService._id).orFail();
    assert.deepEqual(service.media, ["https://trusted.test/intent-original"]);
    assert.equal((await ImageAdmission.findById(replacement.admission._id).orFail()).status, "ACTIVE");
    assert.equal(await ProviderAssetReference.countDocuments({ entityType: "CREATOR_SERVICE", entityId: service._id, state: "CURRENT" }), 1);
    assert.equal(await CreatorMediaCleanupIntent.countDocuments({ entityType: "CREATOR_SERVICE", entityId: service._id }), 0);
  } finally { await server.close(); }
});

test("Creator Service deletion restores released references when deletion fails before commit", async () => {
  const actor = await seedCreator(); const admitted = await seedAdmission(actor, "https://trusted.test/delete-rollback"); const server = await startServer();
  try {
    const created = await fetch(`${server.url}/services`, body(actor, createPayload([admissionClaim(admitted.admission.admissionReference)])));
    assert.equal(created.status, 201); const { service: responseService } = await created.json() as { service: { _id: string } };
    await withStaticFailure(CreatorService, "deleteOne", async () => {
      const response = await fetch(`${server.url}/services/${responseService._id}`, { method: "DELETE", headers: { "x-actor": actor.toString() } });
      assert.equal(response.status, 500);
    }, "injected delete failure");
    const service = await CreatorService.findById(responseService._id).orFail();
    assert.deepEqual(service.media, ["https://trusted.test/delete-rollback"]);
    assert.equal(await ProviderAssetReference.countDocuments({ entityType: "CREATOR_SERVICE", entityId: service._id, state: "CURRENT" }), 1);
    assert.equal(await CreatorMediaCleanupIntent.countDocuments({ entityType: "CREATOR_SERVICE", entityId: service._id }), 0);
    assert.equal((await ImageAdmission.findById(admitted.admission._id).orFail()).status, "CONSUMED");
  } finally { await server.close(); }
});
