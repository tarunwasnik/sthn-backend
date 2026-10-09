import { TextModerationDomain, TextModerationEntry, TextModerationProviderResult } from "./textModeration.types";

export interface TextModerationProviderAdapter {
  moderateText(input: Readonly<{
    domain: TextModerationDomain;
    entries: readonly TextModerationEntry[];
  }>): Promise<TextModerationProviderResult>;
}

export class UnavailableTextModerationProvider implements TextModerationProviderAdapter {
  async moderateText(): Promise<TextModerationProviderResult> {
    return { decision: "UNAVAILABLE" };
  }
}
