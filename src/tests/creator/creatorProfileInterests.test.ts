import assert from "node:assert/strict";
import test from "node:test";
import { Types } from "mongoose";
import { CreatorProfile } from "../../models/creatorProfile.model";

test("Creator profiles can retain interests without inventing a service category", async () => {
  const profile = new CreatorProfile({ userId: new Types.ObjectId(), slug: "fixture-creator", displayName: "Fixture", country: "IN", city: "Test", currency: "INR", status: "active", interests: ["Music", "Travel"] });
  await profile.validate();
  assert.equal(profile.primaryCategory, undefined);
  assert.deepEqual(profile.categories, []);
  assert.deepEqual(profile.interests, ["Music", "Travel"]);
});
