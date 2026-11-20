import type { ProfileVerificationInferenceResultDocument } from "../../models/profileVerificationInferenceResult.model";

type Source = Pick<ProfileVerificationInferenceResultDocument, "pipeline" | "findings" | "profileMediaShadowAnalysis">;
const score = (value: number | undefined) => typeof value === "number" && Number.isFinite(value) && value >= -1 && value <= 1 ? value : null;
const count = (value: number | undefined, maximum: number) => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= maximum ? value : null;
const component = (value: Source["pipeline"]["detector"]) => value ? { identifier: value.identifier, version: value.version, artifactSha256: value.artifactSha256 } : null;

/** Authorized Admin projection only. Never spread stored documents or infer success from absence.
 * Counts describe the live/media pass, not the separately repeated legacy avatar pass.
 * Historical labels are retained as recorded; they are not evidence of executed operations.
 */
export const toAdminInferenceAdvisory = (source: Source | null) => {
  if (!source) return null;
  const analysis = source.profileMediaShadowAnalysis;
  const legacyLabels = source.pipeline.pipelineVersion === "STHN_SFACE_SHADOW_MEDIAN_3_NO_THRESHOLD_V2"
    || source.pipeline.preprocessingVersion === "YUNET_5PT_SFACE_112_BGR_L2_COSINE_MEDIAN_MIN3_NO_THRESHOLD_V1";
  return {
    pipeline: {
      kind: source.pipeline.kind, pipelineVersion: source.pipeline.pipelineVersion,
      runtimeIdentifier: source.pipeline.runtimeIdentifier, runtimeVersion: source.pipeline.runtimeVersion,
      preprocessingVersion: source.pipeline.preprocessingVersion ?? null,
      detector: component(source.pipeline.detector), embedding: component(source.pipeline.embedding),
      metadataStatus: legacyLabels ? "LEGACY_LABELS_UNRELIABLE" as const : "AS_RECORDED" as const,
    },
    detectorUsableCaptureCount: count(source.findings.crossCapture?.usableCaptureCount, 5),
    embeddedLiveCaptureCount: count(analysis?.live?.usableCaptureCount, 5),
    // Generic findings remain separate from the actual detailed comparisons below.
    genericCrossCaptureStatus: source.findings.crossCapture?.status ?? null,
    // Old code also used NO_USABLE_FACE for skipped/failed operations. Its meaning is ambiguous.
    genericAvatarStatus: legacyLabels && source.findings.avatar?.status === "NO_USABLE_FACE" ? null : source.findings.avatar?.status ?? null,
    antiSpoofStatus: source.findings.antiSpoof?.status ?? null,
    profileMediaShadowAnalysis: analysis ? {
      status: analysis.status, reasonCode: analysis.reasonCode ?? null, processedAt: analysis.processedAt,
      model: { identifier: analysis.model.identifier, version: analysis.model.version },
      summary: {
        submittedMediaCount: count(analysis.summary.submittedMediaCount, 8), processedMediaCount: count(analysis.summary.processedMediaCount, 8),
        mediaWithNoFaceCount: count(analysis.summary.mediaWithNoFaceCount, 8), mediaWithUsableFacesCount: count(analysis.summary.mediaWithUsableFacesCount, 8),
        multiFaceMediaCount: count(analysis.summary.multiFaceMediaCount, 8), failedMediaCount: count(analysis.summary.failedMediaCount, 8),
      },
      live: {
        usableCaptureCount: count(analysis.live.usableCaptureCount, 5), pairwiseComparisonCount: count(analysis.live.pairwiseComparisonCount, 10),
        minimumSimilarity: score(analysis.live.minimumSimilarity), maximumSimilarity: score(analysis.live.maximumSimilarity),
        meanSimilarity: score(analysis.live.meanSimilarity), medianSimilarity: score(analysis.live.medianSimilarity),
      },
      media: analysis.media.slice(0, 8).map(item => ({
        role: item.role, profilePhotoIndex: count(item.profilePhotoIndex, 5), status: item.status,
        detectedFaceCount: count(item.detectedFaceCount, 50), usableFaceCount: count(item.usableFaceCount, 50), candidateCount: count(item.candidateCount, 50),
        bestCandidate: item.bestCandidate ? {
          candidateIndex: count(item.bestCandidate.candidateIndex, 49), comparisonCount: count(item.bestCandidate.comparisonCount, 5),
          minimumSimilarity: score(item.bestCandidate.minimumSimilarity), maximumSimilarity: score(item.bestCandidate.maximumSimilarity),
          meanSimilarity: score(item.bestCandidate.meanSimilarity), medianSimilarity: score(item.bestCandidate.medianSimilarity),
        } : null,
        secondBestMedianSimilarity: score(item.secondBestMedianSimilarity),
        // Old negative margins were accepted by the former schema. Do not expose them as valid evidence.
        bestVsSecondMargin: typeof item.bestVsSecondMargin === "number" && Number.isFinite(item.bestVsSecondMargin)
          && item.bestVsSecondMargin >= 0 && item.bestVsSecondMargin <= 2 ? item.bestVsSecondMargin : null,
      })),
    } : null,
  };
};

export type AdminInferenceAdvisoryDto = ReturnType<typeof toAdminInferenceAdvisory>;
