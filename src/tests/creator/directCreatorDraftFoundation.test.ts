import assert from "node:assert/strict";
import { test } from "node:test";
import { Types } from "mongoose";

import { CreatorApplication } from "../../models/creatorApplication.model";
import { parseCreatorMediaClaims } from "../../services/creator/creatorMediaAdmissionContract";

test("Creator drafts permit partial fields for both journeys while submitted applications retain required-field validation", () => {
  const directDraft = new CreatorApplication({
    userId: new Types.ObjectId(), applicationJourney: "direct_creator", draftVersion: 0, verificationRevision: 1,
    displayName: "", primaryCategory: "", country: "", city: "", currency: "", publicBio: "", status: "draft",
  });
  const upgradeDraft = new CreatorApplication({
    userId: new Types.ObjectId(), applicationJourney: "user_upgrade", draftVersion: 0, verificationRevision: 1,
    displayName: "", primaryCategory: "", country: "", city: "", currency: "", publicBio: "", status: "draft",
  });
  assert.equal(directDraft.validateSync(), undefined);
  assert.equal(upgradeDraft.validateSync(), undefined);

  const missingSubmittedMedia = new CreatorApplication({ userId: new Types.ObjectId(), status: "submitted" });
  assert.ok(missingSubmittedMedia.validateSync());

  const completeSubmission = new CreatorApplication({
    userId: new Types.ObjectId(), status: "submitted", displayName: "Creator", primaryCategory: "Music", country: "India", city: "Mumbai", currency: "INR", publicBio: "Bio", languages: ["English"],
    avatarUrl: "https://trusted.test/avatar.jpg", coverUrl: "https://trusted.test/cover.jpg", media: ["https://trusted.test/one.jpg", "https://trusted.test/two.jpg"],
  });
  assert.equal(completeSubmission.validateSync(), undefined);

  completeSubmission.media = ["https://trusted.test/one.jpg"];
  assert.ok(completeSubmission.validateSync()?.errors.media);
  completeSubmission.media = Array.from({ length: 7 }, (_, index) => `https://trusted.test/${index}.jpg`);
  assert.ok(completeSubmission.validateSync()?.errors.media);
});

test("draft media claims can remove an avatar or cover but cannot remove an individual gallery item", () => {
  assert.deepEqual(parseCreatorMediaClaims({ avatar: { kind: "REMOVE" }, cover: { kind: "REMOVE" }, media: [] }), {
    avatar: { kind: "REMOVE" }, cover: { kind: "REMOVE" }, media: [],
  });
  assert.throws(() => parseCreatorMediaClaims({ media: [{ kind: "REMOVE" }] }), /cannot remove individual items/);
});
