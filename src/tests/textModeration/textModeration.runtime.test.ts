import assert from "node:assert/strict";
import http from "node:http";
import { after, before, beforeEach, test } from "node:test";
import jwt from "jsonwebtoken";

import app from "../../app";
import User from "../../models/User";
import { UserProfile } from "../../models/userProfile.model";
import { FaceVerificationSession } from "../../models/faceVerificationSession.model";
import { CreatorApplication } from "../../models/creatorApplication.model";
import {
  fingerprintTextModerationPayload,
  normalizeCreatorApplicationModerationPayload,
  normalizeTextModerationRequest,
  normalizeUserProfileModerationPayload,
  textModerationEntries,
} from "../../services/textModeration/textModerationNormalization.service";
import { requireTextModerationAdmission } from "../../services/textModeration/textModerationAdmission.service";
import { moderateText, setTextModerationProviderForTests } from "../../services/textModeration/textModeration.service";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "t3a-test-jwt-secret";
process.env.TEXT_MODERATION_ADMISSION_SECRET = "t3a-test-admission-secret-with-at-least-32-characters";

let server: http.Server;
let baseUrl: string;

before(async () => {
  await connectPhase7HDatabase();
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("T3A test server did not bind");
  baseUrl = `http://127.0.0.1:${address.port}`;
}, { timeout: 120_000 });

beforeEach(async () => {
  await clearPhase7HDatabase();
  setTextModerationProviderForTests();
});

after(async () => {
  setTextModerationProviderForTests();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await disconnectPhase7HDatabase();
}, { timeout: 30_000 });

test("canonical normalization trims content, preserves Unicode and submitted array order", () => {
  const profile = normalizeUserProfileModerationPayload({
    bio: "  नमस्ते दुनिया  ",
    interests: ["  संगीत  ", "यात्रा", "संगीत"],
  });
  assert.equal(profile.bio, "नमस्ते दुनिया");
  assert.deepEqual(profile.interests, ["संगीत", "यात्रा", "संगीत"]);

  const creator = normalizeCreatorApplicationModerationPayload({
    publicBio: "  Portrait artist  ",
    services: [" Portraits ", "Events"],
  });
  assert.deepEqual(creator, {
    domain: "CREATOR_APPLICATION",
    publicBio: "Portrait artist",
    services: ["Portraits", "Events"],
  });
  assert.deepEqual(textModerationEntries(creator), [
    { target: { field: "publicBio" }, text: "Portrait artist" },
    { target: { field: "services", itemIndex: 0 }, text: "Portraits" },
    { target: { field: "services", itemIndex: 1 }, text: "Events" },
  ]);
});

test("fingerprints are stable for canonical equivalents and change with moderated content", () => {
  const first = normalizeUserProfileModerationPayload({ bio: " Hello ", interests: ["Music", " Travel "] });
  const equivalent = normalizeUserProfileModerationPayload({ bio: "Hello", interests: ["Music", "Travel"] });
  const changed = normalizeUserProfileModerationPayload({ bio: "Hello!", interests: ["Music", "Travel"] });
  assert.equal(fingerprintTextModerationPayload(first), fingerprintTextModerationPayload(equivalent));
  assert.notEqual(fingerprintTextModerationPayload(first), fingerprintTextModerationPayload(changed));

  const creator = normalizeCreatorApplicationModerationPayload({ publicBio: "Portrait artist", services: ["Portraits", "Events"] });
  const changedCreatorBio = normalizeCreatorApplicationModerationPayload({ publicBio: "Event artist", services: ["Portraits", "Events"] });
  const changedCreatorService = normalizeCreatorApplicationModerationPayload({ publicBio: "Portrait artist", services: ["Portraits", "Weddings"] });
  assert.notEqual(fingerprintTextModerationPayload(creator), fingerprintTextModerationPayload(changedCreatorBio));
  assert.notEqual(fingerprintTextModerationPayload(creator), fingerprintTextModerationPayload(changedCreatorService));
});

test("request parsing rejects invalid domains, arbitrary fields and private fields", () => {
  assert.throws(() => normalizeTextModerationRequest({ domain: "USER_PROFILE", bio: "Hello", interests: [], realName: "Private" }), /allowlisted/);
  assert.throws(() => normalizeTextModerationRequest({ domain: "USER_PROFILE", bio: "Hello", interests: [], email: "private@test.local" }), /allowlisted/);
  assert.throws(() => normalizeTextModerationRequest({ domain: "CREATOR_APPLICATION", displayName: "Excluded", publicBio: "Hello", services: [] }), /allowlisted/);
  assert.throws(() => normalizeTextModerationRequest({ domain: "UNKNOWN", bio: "Hello", interests: [] }), /domain/);
});

test("structured and non-allowlisted Creator Application values never reach the semantic adapter", async () => {
  let providerCalls = 0;
  setTextModerationProviderForTests({ moderateText: async () => { providerCalls += 1; return { decision: "ALLOW" }; } });
  await assert.rejects(moderateText({
    domain: "CREATOR_APPLICATION",
    publicBio: "Portrait artist",
    services: [{ title: "Portraits", price: 1000 }],
  }, "creator-user"), /Invalid services/);
  await assert.rejects(moderateText({
    domain: "CREATOR_APPLICATION",
    publicBio: "Portrait artist",
    services: ["Portraits"],
    currency: "INR",
  }, "creator-user"), /allowlisted/);
  assert.equal(providerCalls, 0);
});

test("deterministic block and unavailable provider remain distinct bounded outcomes", async () => {
  const blocked = await moderateText({
    domain: "USER_PROFILE",
    bio: "Contains __STHN_EXPLICIT_PROHIBITED_FIXTURE__ here",
    interests: [],
  }, "user-1");
  assert.equal(blocked.decision, "BLOCK");
  assert.equal(blocked.category, "PROFANITY");
  assert.deepEqual(blocked.target, { field: "bio" });
  assert.equal(blocked.admissionToken, undefined);

  const unavailable = await moderateText({ domain: "USER_PROFILE", bio: "Ordinary profile text", interests: ["Music"] }, "user-1");
  assert.equal(unavailable.decision, "UNAVAILABLE");
  assert.equal(unavailable.admissionToken, undefined);
});

test("ALLOW proof binds user, domain and the exact canonical content fingerprint", async () => {
  setTextModerationProviderForTests({ moderateText: async () => ({ decision: "ALLOW" }) });
  const payload = normalizeCreatorApplicationModerationPayload({
    publicBio: "I create documentary portraits.",
    services: ["Portrait sessions"],
  });
  const result = await moderateText(payload, "creator-user");
  assert.equal(result.decision, "ALLOW");
  assert.ok(result.admissionToken);
  assert.doesNotThrow(() => requireTextModerationAdmission({
    token: result.admissionToken,
    domain: payload.domain,
    userId: "creator-user",
    fingerprint: fingerprintTextModerationPayload(payload),
  }));
  assert.throws(() => requireTextModerationAdmission({
    token: result.admissionToken,
    domain: payload.domain,
    userId: "creator-user",
    fingerprint: fingerprintTextModerationPayload({ ...payload, publicBio: "Changed" }),
  }), /changed/);

  const profilePayload = normalizeUserProfileModerationPayload({ bio: "Profile bio", interests: ["Music"] });
  const profileResult = await moderateText(profilePayload, "creator-user");
  assert.ok(profileResult.admissionToken);
  assert.throws(() => requireTextModerationAdmission({
    token: profileResult.admissionToken,
    domain: payload.domain,
    userId: "creator-user",
    fingerprint: fingerprintTextModerationPayload(payload),
  }), /changed/);
});

test("moderation endpoint requires authentication, rejects private input, handles Unicode, and mutates no profile or Face AI state", async () => {
  const user = await User.create({
    email: "t3a-route@test.local",
    password: "test-password",
    status: "active",
    governanceState: "ACTIVE",
  });
  const token = jwt.sign({ id: String(user._id), role: "user" }, process.env.JWT_SECRET!);
  const url = `${baseUrl}/api/v1/text-moderation`;
  assert.equal((await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ domain: "USER_PROFILE", bio: "Hello", interests: [] }) })).status, 401);

  const privateInput = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ domain: "USER_PROFILE", bio: "Hello", interests: [], mobileNumber: "9999999999" }),
  });
  assert.equal(privateInput.status, 400);

  const unicode = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ domain: "USER_PROFILE", bio: "こんにちは、写真が好きです", interests: ["音楽"] }),
  });
  assert.equal(unicode.status, 200);
  assert.equal((await unicode.json() as { decision: string }).decision, "UNAVAILABLE");
  assert.equal(await UserProfile.countDocuments(), 0);
  assert.equal(await CreatorApplication.countDocuments(), 0);
  assert.equal(await FaceVerificationSession.countDocuments(), 0);
});

test("direct profile submission cannot bypass admission and creates no profile or Face AI state", async () => {
  const user = await User.create({
    email: "t3a-profile-gate@test.local",
    password: "test-password",
    status: "pending_profile",
    governanceState: "ACTIVE",
  });
  const token = jwt.sign({ id: String(user._id), role: "user" }, process.env.JWT_SECRET!);
  const response = await fetch(`${baseUrl}/api/v1/profile/me`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({
      username: "t3a-profile-gate",
      realName: "Private Name",
      dateOfBirth: "1990-01-01",
      mobileCountryCode: "+91",
      mobileNumber: "9876543210",
      country: "India",
      city: "Mumbai",
      languages: ["English"],
      bio: "Ordinary profile text",
      interests: ["Music"],
      avatar: "https://example.test/avatar.jpg",
      cover: "https://example.test/cover.jpg",
      profilePhotos: ["https://example.test/one.jpg", "https://example.test/two.jpg"],
    }),
  });
  assert.equal(response.status, 409);
  assert.equal(await UserProfile.countDocuments(), 0);
  assert.equal(await FaceVerificationSession.countDocuments(), 0);
});

test("creator submission rejects changed proof, then accepts exact admitted text without altering Admin authority", async () => {
  const user = await User.create({
    email: "t3a-creator-gate@test.local",
    password: "test-password",
    status: "active",
    governanceState: "ACTIVE",
  });
  await UserProfile.create({
    userId: user._id,
    username: "t3a-creator-gate",
    dateOfBirth: new Date("1990-01-01"),
    bio: "Verified profile",
    interests: [],
    avatar: "https://example.test/avatar.jpg",
    cover: "https://example.test/cover.jpg",
    profilePhotos: ["https://example.test/one.jpg", "https://example.test/two.jpg"],
    profileStatus: "verified",
  });
  setTextModerationProviderForTests({ moderateText: async () => ({ decision: "ALLOW" }) });
  const moderated = {
    domain: "CREATOR_APPLICATION" as const,
    publicBio: "I create documentary portraits.",
    services: ["Portrait sessions"],
  };
  const admission = await moderateText(moderated, String(user._id));
  assert.ok(admission.admissionToken);
  const authToken = jwt.sign({ id: String(user._id), role: "user" }, process.env.JWT_SECRET!);
  const send = (publicBio: string, services: string[], displayName = "Documentary Studio") => fetch(`${baseUrl}/api/v1/creator-applications`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${authToken}` },
    body: JSON.stringify({
      displayName,
      publicBio,
      services,
      primaryCategory: "Photography",
      country: "India",
      city: "Mumbai",
      currency: "INR",
      languages: ["English"],
      textModerationAdmission: admission.admissionToken,
    }),
  });

  assert.equal((await send("Changed after moderation", moderated.services)).status, 409);
  assert.equal((await send(moderated.publicBio, ["Changed service text"])).status, 409);
  assert.equal(await CreatorApplication.countDocuments(), 0);
  assert.equal((await User.findById(user._id))?.creatorStatus, "none");

  const accepted = await send(moderated.publicBio, moderated.services, "Display Name Is Outside T3A");
  assert.equal(accepted.status, 201);
  const application = await CreatorApplication.findOne({ userId: user._id }).lean();
  assert.equal(application?.status, "submitted");
  assert.equal(application?.displayName, "Display Name Is Outside T3A");
  assert.equal((await User.findById(user._id))?.creatorStatus, "pending");
});
