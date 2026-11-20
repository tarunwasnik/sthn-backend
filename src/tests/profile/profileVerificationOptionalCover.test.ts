import assert from "node:assert/strict";
import { test } from "node:test";

import { createProfileVerificationSubmittedMediaSnapshot } from "../../services/profile/profileVerificationSubmittedMedia.service";

test("verification snapshots require and retain the submitted cover", () => {
  assert.throws(() => createProfileVerificationSubmittedMediaSnapshot({
    avatar: "https://trusted.test/avatar.jpg",
    profilePhotos: ["https://trusted.test/one.jpg", "https://trusted.test/two.jpg"],
  } as unknown as { avatar: string; cover: string; profilePhotos: string[] }));

  const snapshot = createProfileVerificationSubmittedMediaSnapshot({
    avatar: "https://trusted.test/avatar.jpg",
    cover: "https://trusted.test/cover.jpg",
    profilePhotos: ["https://trusted.test/one.jpg", "https://trusted.test/two.jpg"],
  });

  assert.equal(snapshot.cover.role, "COVER");
  assert.equal(snapshot.avatar.role, "AVATAR");
  assert.deepEqual(snapshot.profilePhotos.map((photo) => photo.role), ["PROFILE_PHOTO", "PROFILE_PHOTO"]);
});
