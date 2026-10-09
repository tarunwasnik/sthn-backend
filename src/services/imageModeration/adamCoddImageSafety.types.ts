export type AdamCoddImageSafetyDecision = "PASS" | "BLOCK" | "UNAVAILABLE";

/** Deliberately bounded: no logits, probabilities, labels, thresholds, or source paths leave this service. */
export type AdamCoddImageSafetyResult = Readonly<{
  decision: AdamCoddImageSafetyDecision;
  reasonCode: "IMAGE_POLICY" | "INVALID_IMAGE" | "IMAGE_SAFETY_UNAVAILABLE";
}>;

export const ADAMCODD_BLOCK_MESSAGE = "This image cannot be used because it does not meet the platform image policy. Please choose a different image.";
