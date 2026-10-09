export type TextModerationDomain = "USER_PROFILE" | "CREATOR_APPLICATION";

export type TextModerationDecision = "ALLOW" | "BLOCK" | "UNAVAILABLE";

export type TextModerationCategory =
  | "PROFANITY"
  | "SEXUAL"
  | "ABUSIVE_OR_HARASSING"
  | "HATE"
  | "THREAT_OR_VIOLENCE"
  | "OTHER_INAPPROPRIATE";

export type TextModerationField =
  | "bio"
  | "interests"
  | "publicBio"
  | "services";

export interface TextModerationTarget {
  field: TextModerationField;
  itemIndex?: number;
}

export interface UserProfileModerationPayload {
  domain: "USER_PROFILE";
  bio: string;
  interests: string[];
}

export interface CreatorApplicationModerationPayload {
  domain: "CREATOR_APPLICATION";
  publicBio: string;
  services: string[];
}

export type TextModerationPayload =
  | UserProfileModerationPayload
  | CreatorApplicationModerationPayload;

export interface TextModerationEntry {
  target: TextModerationTarget;
  text: string;
}

export type TextModerationProviderResult =
  | { decision: "ALLOW" }
  | { decision: "UNAVAILABLE" }
  | { decision: "BLOCK"; category: TextModerationCategory; target: TextModerationTarget };

export type TextModerationResult = TextModerationProviderResult & {
  message: string;
  fingerprint: string;
  admissionToken?: string;
};
