import {
  BoundedRawProviderDetails,
  ProviderEvaluationResult,
  TextModerationEvaluationFixture,
  TextModerationEvaluationProvider,
} from "../textModerationEvaluation.types";

export const OPENAI_MODERATION_ENDPOINT = "https://api.openai.com/v1/moderations" as const;
export const OPENAI_MODERATION_MODEL = "omni-moderation-latest" as const;
export const OPENAI_EVALUATION_TIMEOUT_MS = 15_000;
export const OPENAI_EVALUATION_MAX_ATTEMPTS = 3;

type FetchImplementation = typeof fetch;
type SleepImplementation = (milliseconds: number) => Promise<void>;

export interface OpenAITextModerationEvaluationProviderOptions {
  apiKey: string;
  fetchImplementation?: FetchImplementation;
  sleepImplementation?: SleepImplementation;
  timeoutMs?: number;
  maxAttempts?: number;
}

type AttemptResult = Readonly<{
  result: ProviderEvaluationResult;
  retryable: boolean;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const errorResult = (
  status: "UNAVAILABLE" | "ERROR",
  errorCode: string,
  summary: string,
  attempts: number,
  httpStatus?: number,
): ProviderEvaluationResult => ({
  status,
  errorCode,
  raw: {
    summary,
    metadata: {
      provider: "OPENAI",
      requestedModel: OPENAI_MODERATION_MODEL,
      attempts,
      ...(httpStatus === undefined ? {} : { httpStatus }),
    },
  },
});

const parseResponse = (value: unknown, attempts: number): ProviderEvaluationResult | null => {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.model !== "string" ||
    !Array.isArray(value.results) || value.results.length !== 1 || !isRecord(value.results[0])) return null;
  const result = value.results[0];
  if (typeof result.flagged !== "boolean" || !isRecord(result.categories) ||
    !isRecord(result.category_scores) || !isRecord(result.category_applied_input_types)) return null;

  const names = [...new Set([
    ...Object.keys(result.categories),
    ...Object.keys(result.category_scores),
    ...Object.keys(result.category_applied_input_types),
  ])].sort();
  if (!names.length || names.length > 40) return null;
  const labels: NonNullable<BoundedRawProviderDetails["labels"]>[number][] = [];
  for (const name of names) {
    const flagged = result.categories[name];
    const score = result.category_scores[name];
    const applied = result.category_applied_input_types[name];
    if ((typeof flagged !== "boolean" && flagged !== null) ||
      typeof score !== "number" || !Number.isFinite(score) ||
      !Array.isArray(applied) || applied.some((item) => typeof item !== "string")) return null;
    labels.push({ name, flagged, score, appliedInputTypes: applied as string[] });
  }

  return {
    status: "COMPLETED",
    decision: result.flagged ? "BLOCK" : "ALLOW",
    raw: {
      summary: `OpenAI default flagged=${result.flagged}`,
      labels,
      metadata: {
        provider: "OPENAI",
        requestedModel: OPENAI_MODERATION_MODEL,
        actualModel: value.model.slice(0, 120),
        requestId: value.id.slice(0, 160),
        overallFlagged: result.flagged,
        attempts,
      },
    },
  };
};

export const openAIApiKeyFromEnvironment = (): string => {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OpenAI moderation evaluation is not configured. Set OPENAI_API_KEY in backend/.env or the local process environment.");
  }
  return apiKey;
};

export class OpenAITextModerationEvaluationProvider implements TextModerationEvaluationProvider {
  readonly id = "OPENAI_MODERATION_DEFAULT_V1";
  readonly displayName = "OpenAI Moderation";
  readonly requestedModel = OPENAI_MODERATION_MODEL;

  private readonly apiKey: string;
  private readonly fetchImplementation: FetchImplementation;
  private readonly sleepImplementation: SleepImplementation;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;

  constructor(options: OpenAITextModerationEvaluationProviderOptions) {
    const apiKey = options.apiKey.trim();
    if (!apiKey) throw new Error("OpenAI moderation evaluation requires a non-empty OPENAI_API_KEY");
    const timeoutMs = options.timeoutMs ?? OPENAI_EVALUATION_TIMEOUT_MS;
    const maxAttempts = options.maxAttempts ?? OPENAI_EVALUATION_MAX_ATTEMPTS;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw new Error("Invalid OpenAI evaluation timeout");
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3) throw new Error("Invalid OpenAI evaluation attempt limit");
    this.apiKey = apiKey;
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.sleepImplementation = options.sleepImplementation ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.timeoutMs = timeoutMs;
    this.maxAttempts = maxAttempts;
  }

  async evaluate(fixture: TextModerationEvaluationFixture): Promise<ProviderEvaluationResult> {
    let finalResult: ProviderEvaluationResult = errorResult("UNAVAILABLE", "OPENAI_NETWORK_ERROR", "OpenAI request was unavailable", 1);
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      const attempted = await this.attempt(fixture.text, attempt);
      finalResult = attempted.result;
      if (!attempted.retryable || attempt === this.maxAttempts) return finalResult;
      await this.sleepImplementation(250 * (2 ** (attempt - 1)));
    }
    return finalResult;
  }

  private async attempt(text: string, attempt: number): Promise<AttemptResult> {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    try {
      const response = await this.fetchImplementation(OPENAI_MODERATION_ENDPOINT, {
        method: "POST",
        signal: controller.signal,
        headers: {
          accept: "application/json",
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ model: OPENAI_MODERATION_MODEL, input: text }),
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) return {
          retryable: false,
          result: errorResult("ERROR", "OPENAI_AUTHENTICATION_FAILED", "OpenAI authentication failed", attempt, response.status),
        };
        if (response.status === 429) return {
          retryable: true,
          result: errorResult("UNAVAILABLE", "OPENAI_RATE_LIMITED", "OpenAI rate limit prevented evaluation", attempt, response.status),
        };
        if (response.status >= 500 && response.status <= 599) return {
          retryable: true,
          result: errorResult("UNAVAILABLE", "OPENAI_SERVER_ERROR", "OpenAI server error prevented evaluation", attempt, response.status),
        };
        return {
          retryable: false,
          result: errorResult("ERROR", "OPENAI_REQUEST_REJECTED", "OpenAI rejected the evaluation request", attempt, response.status),
        };
      }
      let payload: unknown;
      try {
        payload = JSON.parse(await response.text()) as unknown;
      } catch {
        return {
          retryable: false,
          result: errorResult("ERROR", "OPENAI_MALFORMED_RESPONSE", "OpenAI returned malformed JSON", attempt),
        };
      }
      const parsed = parseResponse(payload, attempt);
      return parsed
        ? { retryable: false, result: parsed }
        : { retryable: false, result: errorResult("ERROR", "OPENAI_UNEXPECTED_RESPONSE", "OpenAI returned an unexpected response shape", attempt) };
    } catch {
      return timedOut
        ? { retryable: true, result: errorResult("UNAVAILABLE", "OPENAI_TIMEOUT", "OpenAI evaluation request timed out", attempt) }
        : { retryable: true, result: errorResult("UNAVAILABLE", "OPENAI_NETWORK_ERROR", "OpenAI network request failed", attempt) };
    } finally {
      clearTimeout(timeout);
    }
  }
}
