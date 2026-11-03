import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { createServer, Server } from "node:http";
import express from "express";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";

import routes from "../../routes/v1";
import User from "../../models/User";
import { CreatorProfile } from "../../models/creatorProfile.model";
import { CreatorEntitlement } from "../../models/creatorEntitlement.model";
import { PayoutDestination } from "../../models/payoutDestination.model";
import { PayoutDestinationType } from "../../enums/financial/payoutDestinationType.enum";
import { PayoutDestinationVerificationStatus } from "../../enums/financial/payoutDestinationVerificationStatus.enum";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "creator-financial-read-test";

let server: Server;
let baseUrl: string;

before(async () => {
  await connectPhase7HDatabase();
  await Promise.all([CreatorEntitlement.init(), PayoutDestination.init()]);
  const app = express();
  app.use(express.json());
  app.use("/api/v1", routes);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
}, { timeout: 120_000 });

beforeEach(clearPhase7HDatabase);
after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await disconnectPhase7HDatabase();
});

async function createCreator(status: "active" | "suspended" = "active") {
  const user = await User.create({
    email: `${new Types.ObjectId()}@test.local`, role: "creator", status, creatorStatus: "approved",
    governanceState: status === "suspended" ? "SUSPENDED" : "ACTIVE",
  });
  await CreatorProfile.create({
    userId: user._id, slug: `creator-${user._id}`, displayName: "Test Creator", primaryCategory: "Advice",
    country: "IN", city: "Mumbai", currency: "INR", status: "active",
  });
  return user;
}

function authorization(userId: Types.ObjectId, role = "creator") {
  return { authorization: `Bearer ${jwt.sign({ id: String(userId), role }, process.env.JWT_SECRET!)}` };
}

async function createEntitlement(creatorId: Types.ObjectId, suffix: string) {
  return CreatorEntitlement.create({
    decisionAuthority: "STAGE_1E_TEST", decisionId: suffix, fingerprint: `fingerprint-${suffix}`,
    bookingId: new Types.ObjectId(), paymentId: new Types.ObjectId(), creatorId, currency: "INR",
    totalAmount: 1000, creatorAmount: 700, platformAmount: 300, customerRefundAmount: 0, state: "HELD",
  });
}

test("authenticated Creators can read only their bounded entitlement history and restricted state", async () => {
  const creator = await createCreator("suspended");
  const otherCreator = await createCreator();
  const own = await createEntitlement(creator._id, "own");
  await createEntitlement(creator._id, "own-second");
  await createEntitlement(otherCreator._id, "other");

  const anonymous = await fetch(`${baseUrl}/creator/self-status`);
  assert.equal(anonymous.status, 401);

  const statusResponse = await fetch(`${baseUrl}/creator/self-status`, { headers: authorization(creator._id) });
  assert.equal(statusResponse.status, 200);
  const status = await statusResponse.json() as { status: { governanceState: string; blocksAcceptingBookings: boolean } };
  assert.equal(status.status.governanceState, "SUSPENDED");
  assert.equal(status.status.blocksAcceptingBookings, true);

  const response = await fetch(`${baseUrl}/creator/entitlements?limit=1`, { headers: authorization(creator._id) });
  assert.equal(response.status, 200);
  const body = await response.json() as { entitlements: Array<{ entitlementId: string; authorizedCreatorAmount: number }>; page: { limit: number; returned: number } };
  assert.equal(body.page.limit, 1);
  assert.equal(body.page.returned, 1);
  assert.equal(body.entitlements.length, 1);
  assert.notEqual(body.entitlements[0].entitlementId, String((await CreatorEntitlement.findOne({ creatorId: otherCreator._id }).orFail())._id));
  assert.equal(typeof body.entitlements[0].authorizedCreatorAmount, "number");
  assert.ok([String(own._id), String((await CreatorEntitlement.findOne({ decisionId: "own-second" }).orFail())._id)].includes(body.entitlements[0].entitlementId));
});

test("payout destination reads are creator-owned and exclude encrypted and fingerprint data", async () => {
  const creator = await createCreator();
  const otherCreator = await createCreator();
  await PayoutDestination.create({
    destinationReference: "PAYOUT_DESTINATION_TEST_OWN", creatorId: creator._id, type: PayoutDestinationType.UPI,
    verificationStatus: PayoutDestinationVerificationStatus.UNVERIFIED, isActive: true, idempotencyKey: "destination-test-own",
    destinationFingerprint: "private-fingerprint", requestFingerprint: "private-request-fingerprint",
    encryptedPayload: { version: 1, ciphertext: "private-ciphertext", iv: "private-iv", authTag: "private-auth-tag" },
    maskedIdentifier: "te***@upi", declaredCountry: "IN",
  });
  await PayoutDestination.create({
    destinationReference: "PAYOUT_DESTINATION_TEST_OTHER", creatorId: otherCreator._id, type: PayoutDestinationType.UPI,
    verificationStatus: PayoutDestinationVerificationStatus.UNVERIFIED, isActive: true, idempotencyKey: "destination-test-other",
    destinationFingerprint: "other-fingerprint", requestFingerprint: "other-request-fingerprint",
    encryptedPayload: { version: 1, ciphertext: "other-ciphertext", iv: "other-iv", authTag: "other-auth-tag" },
    maskedIdentifier: "ot***@upi", declaredCountry: "IN",
  });

  const response = await fetch(`${baseUrl}/creator/payout-destinations`, { headers: authorization(creator._id) });
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.equal(text.includes("PAYOUT_DESTINATION_TEST_OWN"), true);
  assert.equal(text.includes("PAYOUT_DESTINATION_TEST_OTHER"), false);
  for (const privateValue of ["private-ciphertext", "private-iv", "private-auth-tag", "private-fingerprint", "private-request-fingerprint"]) {
    assert.equal(text.includes(privateValue), false);
  }
});
