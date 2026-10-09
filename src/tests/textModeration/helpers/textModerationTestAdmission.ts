import assert from "node:assert/strict";

import { issueTextModerationAdmission } from "../../../services/textModeration/textModerationAdmission.service";
import {
  fingerprintTextModerationPayload,
  normalizeUserProfileModerationPayload,
} from "../../../services/textModeration/textModerationNormalization.service";

const TEST_ADMISSION_SECRET = "t3a-shared-test-admission-secret-at-least-32-characters";

export const withUserProfileTextAdmission = <T extends Record<string, unknown>>(
  userId: string,
  body: T,
  moderatedInput: { bio: unknown; interests: unknown } = { bio: body.bio, interests: body.interests },
): T & { textModerationAdmission: string } => {
  process.env.TEXT_MODERATION_ADMISSION_SECRET ??= TEST_ADMISSION_SECRET;
  const payload = normalizeUserProfileModerationPayload(moderatedInput);
  const token = issueTextModerationAdmission(
    payload.domain,
    userId,
    fingerprintTextModerationPayload(payload),
  );
  assert.ok(token);
  return { ...body, textModerationAdmission: token };
};
