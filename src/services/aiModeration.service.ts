//backend/src/services/aiModeration.service.ts


export type ModerationFlag =
  | "PHONE_NUMBER"
  | "EMAIL"
  | "SOCIAL_HANDLE"
  | "CONTACT_INTENT"
  | "OBFUSCATED_CONTACT";

export interface ModerationResult {
  flags: ModerationFlag[];
  hasContactIntent: boolean; // ✅ DERIVED, NOT MAGIC
}

/**
 * Deterministic chat moderation
 * (LLM can replace this later without touching controllers)
 */
export const moderateMessage = async (
  message: string
): Promise<ModerationResult> => {
  const text = message.toLowerCase();
  const flags: ModerationFlag[] = [];

  // 📞 Phone numbers
  const phoneRegex =
    /(\+?\d{1,3}[\s\-]?)?(\(?\d{2,4}\)?[\s\-]?)?\d{3,4}[\s\-]?\d{3,4}/;
  if (phoneRegex.test(text)) flags.push("PHONE_NUMBER");

  // 📧 Email
  const emailRegex =
    /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i;
  if (emailRegex.test(text)) flags.push("EMAIL");

  // 🌐 Social intent
  const socialKeywords = [
    "instagram",
    "insta",
    "ig",
    "tg",
    "wa",
    "dc",
    "whatsapp",
    "telegram",
    "snap",
    "discord",
    "dm me",
    "call me",
    "text me",
    "reach me",
  ];
  if (socialKeywords.some(k => text.includes(k))) {
    flags.push("SOCIAL_HANDLE");
  }

  // 🧠 Obfuscation
  if (
    text.includes("dot com") ||
    text.includes("at gmail") ||
    text.includes("at yahoo")
  ) {
    flags.push("OBFUSCATED_CONTACT");
  }

  const hasContactIntent =
    flags.includes("PHONE_NUMBER") ||
    flags.includes("EMAIL") ||
    flags.includes("SOCIAL_HANDLE") ||
    flags.includes("OBFUSCATED_CONTACT");

  if (hasContactIntent) {
    flags.push("CONTACT_INTENT");
  }

  return { flags, hasContactIntent };
};