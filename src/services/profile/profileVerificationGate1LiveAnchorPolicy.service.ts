export const LIVE_ANCHOR_MIN_WEAKEST_PEER_MEDIAN = 0.28;
export const PROFILE_VERIFICATION_GATE1_POLICY_VERSION = "V1";

export type ProfileVerificationGate1Outcome = "PASS" | "LIVE_CAPTURE_TECHNICAL_FAILURE" | "LIVE_ANCHOR_INCOHERENT";
export interface ProfileVerificationGate1LiveAnchorResult {
  outcome: ProfileVerificationGate1Outcome;
  usableCaptureCount: number;
  weakestPeerMedian?: number;
  threshold: number;
  policyVersion: string;
}

const cosine = (left: readonly number[], right: readonly number[]) => left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);
const median = (values: readonly number[]) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
};

/** Pure Gate-1 admission; it has no request/profile lifecycle authority. */
export const evaluateProfileVerificationGate1LiveAnchor = (
  usableEmbeddings: readonly (readonly number[])[],
): ProfileVerificationGate1LiveAnchorResult => {
  if (usableEmbeddings.length !== 5) return { outcome: "LIVE_CAPTURE_TECHNICAL_FAILURE", usableCaptureCount: usableEmbeddings.length, threshold: LIVE_ANCHOR_MIN_WEAKEST_PEER_MEDIAN, policyVersion: PROFILE_VERIFICATION_GATE1_POLICY_VERSION };
  const peerMedians = usableEmbeddings.map((embedding, index) => median(usableEmbeddings.filter((_, peer) => peer !== index).map((peer) => cosine(embedding, peer))));
  const weakestPeerMedian = Math.min(...peerMedians);
  return {
    outcome: weakestPeerMedian >= LIVE_ANCHOR_MIN_WEAKEST_PEER_MEDIAN ? "PASS" : "LIVE_ANCHOR_INCOHERENT",
    usableCaptureCount: usableEmbeddings.length,
    weakestPeerMedian,
    threshold: LIVE_ANCHOR_MIN_WEAKEST_PEER_MEDIAN,
    policyVersion: PROFILE_VERIFICATION_GATE1_POLICY_VERSION,
  };
};
