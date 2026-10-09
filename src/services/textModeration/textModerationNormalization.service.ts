import crypto from "node:crypto";

import { AppError } from "../../utils/AppError";
import {
  CreatorApplicationModerationPayload,
  TextModerationEntry,
  TextModerationPayload,
  UserProfileModerationPayload,
} from "./textModeration.types";

const requireText = (value: unknown, field: string, maxLength: number): string => {
  if (typeof value !== "string") throw new AppError(`Invalid ${field}`, 400, "TEXT_MODERATION_INVALID_INPUT");
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new AppError(`Invalid ${field}`, 400, "TEXT_MODERATION_INVALID_INPUT");
  }
  return normalized;
};

const normalizeTextArray = (value: unknown, field: string, maxItems: number): string[] => {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new AppError(`Invalid ${field}`, 400, "TEXT_MODERATION_INVALID_INPUT");
  }
  return value.map((item) => requireText(item, field, 80));
};

const assertExactKeys = (input: Record<string, unknown>, allowed: readonly string[]) => {
  const allowlist = new Set(allowed);
  if (Object.keys(input).some((key) => !allowlist.has(key))) {
    throw new AppError("Text moderation accepts only allowlisted fields", 400, "TEXT_MODERATION_FIELD_NOT_ALLOWED");
  }
};

export const normalizeUserProfileModerationPayload = (input: {
  bio: unknown;
  interests: unknown;
}): UserProfileModerationPayload => ({
  domain: "USER_PROFILE",
  bio: requireText(input.bio, "bio", 2000),
  interests: normalizeTextArray(input.interests, "interests", 20),
});

export const normalizeCreatorApplicationModerationPayload = (input: {
  publicBio: unknown;
  services: unknown;
}): CreatorApplicationModerationPayload => ({
  domain: "CREATOR_APPLICATION",
  publicBio: requireText(input.publicBio, "public bio", 2000),
  services: normalizeTextArray(input.services, "services", 20),
});

export const normalizeTextModerationRequest = (value: unknown): TextModerationPayload => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AppError("Invalid text moderation request", 400, "TEXT_MODERATION_INVALID_INPUT");
  }
  const input = value as Record<string, unknown>;
  if (input.domain === "USER_PROFILE") {
    assertExactKeys(input, ["domain", "bio", "interests"]);
    return normalizeUserProfileModerationPayload(input as { bio: unknown; interests: unknown });
  }
  if (input.domain === "CREATOR_APPLICATION") {
    assertExactKeys(input, ["domain", "publicBio", "services"]);
    return normalizeCreatorApplicationModerationPayload(input as { publicBio: unknown; services: unknown });
  }
  throw new AppError("Invalid text moderation domain", 400, "TEXT_MODERATION_INVALID_DOMAIN");
};

export const textModerationEntries = (payload: TextModerationPayload): TextModerationEntry[] => {
  if (payload.domain === "USER_PROFILE") {
    return [
      { target: { field: "bio" }, text: payload.bio },
      ...payload.interests.map((text, itemIndex) => ({ target: { field: "interests" as const, itemIndex }, text })),
    ];
  }
  return [
    { target: { field: "publicBio" }, text: payload.publicBio },
    ...payload.services.map((text, itemIndex) => ({ target: { field: "services" as const, itemIndex }, text })),
  ];
};

export const fingerprintTextModerationPayload = (payload: TextModerationPayload): string =>
  crypto.createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
