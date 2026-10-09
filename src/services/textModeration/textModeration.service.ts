import {
  fingerprintTextModerationPayload,
  normalizeTextModerationRequest,
  textModerationEntries,
} from "./textModerationNormalization.service";
import {
  TextModerationPayload,
  TextModerationProviderResult,
  TextModerationResult,
} from "./textModeration.types";
import {
  TextModerationProviderAdapter,
  UnavailableTextModerationProvider,
} from "./textModerationProviderAdapter";
import { issueTextModerationAdmission } from "./textModerationAdmission.service";

const BLOCK_MESSAGE = "This content isn't allowed here. Please use respectful and professional wording.";
const UNAVAILABLE_MESSAGE = "Text moderation is temporarily unavailable. Please try again.";
const ALLOW_MESSAGE = "Text is ready to submit.";
const SYNTHETIC_PROHIBITED_FIXTURE = "__sthn_explicit_prohibited_fixture__";

let provider: TextModerationProviderAdapter = new UnavailableTextModerationProvider();

export const setTextModerationProviderForTests = (adapter?: TextModerationProviderAdapter) => {
  if (process.env.NODE_ENV !== "test") throw new Error("Text moderation provider injection is test-only");
  provider = adapter ?? new UnavailableTextModerationProvider();
};

const deterministicResult = (payload: TextModerationPayload): TextModerationProviderResult | null => {
  const blocked = textModerationEntries(payload).find(({ text }) =>
    text.toLocaleLowerCase().includes(SYNTHETIC_PROHIBITED_FIXTURE),
  );
  return blocked ? { decision: "BLOCK", category: "PROFANITY", target: blocked.target } : null;
};

export const moderateText = async (raw: unknown, userId: string): Promise<TextModerationResult> => {
  const payload = normalizeTextModerationRequest(raw);
  const fingerprint = fingerprintTextModerationPayload(payload);
  const result = deterministicResult(payload) ?? await provider.moderateText({
    domain: payload.domain,
    entries: textModerationEntries(payload),
  });

  if (result.decision === "BLOCK") {
    return { ...result, decision: "BLOCK", message: BLOCK_MESSAGE, fingerprint };
  }
  if (result.decision !== "ALLOW") {
    return { decision: "UNAVAILABLE", message: UNAVAILABLE_MESSAGE, fingerprint };
  }
  const admissionToken = issueTextModerationAdmission(payload.domain, userId, fingerprint);
  if (!admissionToken) {
    return { decision: "UNAVAILABLE", message: UNAVAILABLE_MESSAGE, fingerprint };
  }
  return { decision: "ALLOW", message: ALLOW_MESSAGE, fingerprint, admissionToken };
};
