import { ProfileVerificationSubmittedMediaItem, ProfileVerificationSubmittedMediaSnapshot } from "../../models/profileVerificationRequest.model";
import { alignFaceEvidence, cosineSimilarity, normalizeFaceEmbeddingL2 } from "./profileVerificationFaceEmbedding.service";
import { getProductionFaceEmbeddingAdapter, SFACE_ARTIFACT, SFACE_FACE_EMBEDDING_SPECIFICATION } from "./profileVerificationFaceEmbeddingAdapter";
import { medianSFaceSimilarity, SFACE_SHADOW_MINIMUM_USABLE_CAPTURES } from "./profileVerificationSFaceShadowAnalysis.service";
import { detectYuNetFaces } from "./profileVerificationYuNetRunner";
import { YuNetDetection } from "./profileVerificationYuNet.types";
import { ProfileVerificationProfileMediaShadowAnalysis } from "./profileVerificationInference.types";

type MediaReader = (item: ProfileVerificationSubmittedMediaItem) => Promise<Buffer>;
type Detector = (bytes: Buffer) => Promise<YuNetDetection>;
type Embedder = (input: Awaited<ReturnType<typeof alignFaceEvidence>>) => Promise<number[]>;
const stats = (values: number[]) => ({ minimumSimilarity: Math.min(...values), maximumSimilarity: Math.max(...values), meanSimilarity: values.reduce((sum, value) => sum + value, 0) / values.length, medianSimilarity: medianSFaceSimilarity(values) });
const mediaItems = (snapshot: ProfileVerificationSubmittedMediaSnapshot) => [snapshot.avatar, snapshot.cover, ...snapshot.profilePhotos];

/** Bounded shadow-only live-capture-to-frozen-media analysis. Embeddings never leave this call. */
export const analyseLiveCaptureProfileMediaShadow = async (input: {
  snapshot?: ProfileVerificationSubmittedMediaSnapshot;
  mediaItems?: readonly ProfileVerificationSubmittedMediaItem[];
  usableLiveEmbeddings: readonly unknown[];
  readMedia: MediaReader;
  detector?: Detector;
  embedder?: Embedder;
  processedAt?: Date;
}): Promise<ProfileVerificationProfileMediaShadowAnalysis> => {
  const processedAt = input.processedAt ?? new Date();
  const live = input.usableLiveEmbeddings.map((embedding) => normalizeFaceEmbeddingL2(embedding, SFACE_FACE_EMBEDDING_SPECIFICATION.expectedDimensions));
  const comparisons: number[] = [];
  for (let left = 0; left < live.length; left += 1) for (let right = left + 1; right < live.length; right += 1) comparisons.push(cosineSimilarity(live[left], live[right], SFACE_FACE_EMBEDDING_SPECIFICATION.expectedDimensions));
  const base = { status: "COMPLETED" as const, processedAt, model: { identifier: SFACE_ARTIFACT.identifier, version: SFACE_ARTIFACT.version }, live: { usableCaptureCount: live.length, pairwiseComparisonCount: comparisons.length, ...(comparisons.length ? stats(comparisons) : {}) } };
  const items = input.snapshot ? (input.mediaItems ? [...input.mediaItems] : mediaItems(input.snapshot)) : [];
  if (!input.snapshot) return { ...base, reasonCode: "MEDIA_SNAPSHOT_UNAVAILABLE", summary: { submittedMediaCount: 0, processedMediaCount: 0, mediaWithNoFaceCount: 0, mediaWithUsableFacesCount: 0, multiFaceMediaCount: 0, failedMediaCount: 0 }, media: [] };
  if (live.length < SFACE_SHADOW_MINIMUM_USABLE_CAPTURES) return { ...base, reasonCode: "INSUFFICIENT_USABLE_LIVE_CAPTURES", summary: { submittedMediaCount: items.length, processedMediaCount: 0, mediaWithNoFaceCount: 0, mediaWithUsableFacesCount: 0, multiFaceMediaCount: 0, failedMediaCount: 0 }, media: [] };
  const detector = input.detector ?? ((bytes) => detectYuNetFaces(bytes, "UNSPECIFIED"));
  const embedder = input.embedder ?? ((aligned) => getProductionFaceEmbeddingAdapter().infer(aligned));
  const media: ProfileVerificationProfileMediaShadowAnalysis["media"] = [];
  for (const item of items) {
    try {
      const bytes = await input.readMedia(item);
      const detection = await detector(bytes);
      if (detection.faces.length === 0) { media.push({ role: item.role, ...(item.profilePhotoIndex === undefined ? {} : { profilePhotoIndex: item.profilePhotoIndex }), status: "NO_FACE", detectedFaceCount: 0, usableFaceCount: 0, candidateCount: 0 }); continue; }
      const candidates: Array<{ candidateIndex: number; comparisonCount: number; minimumSimilarity: number; maximumSimilarity: number; meanSimilarity: number; medianSimilarity: number }> = [];
      for (let index = 0; index < detection.faces.length; index += 1) {
        try {
          const embedding = normalizeFaceEmbeddingL2(await embedder(await alignFaceEvidence({ bytes, landmarks: detection.faces[index].landmarks, preprocessing: SFACE_FACE_EMBEDDING_SPECIFICATION.preprocessing })), SFACE_FACE_EMBEDDING_SPECIFICATION.expectedDimensions);
          const values = live.map((reference) => cosineSimilarity(embedding, reference, SFACE_FACE_EMBEDDING_SPECIFICATION.expectedDimensions));
          candidates.push({ candidateIndex: index, comparisonCount: values.length, ...stats(values) });
        } catch { /* Bad face evidence is excluded, not a negative identity result. */ }
      }
      if (!candidates.length) { media.push({ role: item.role, ...(item.profilePhotoIndex === undefined ? {} : { profilePhotoIndex: item.profilePhotoIndex }), status: "NO_USABLE_FACE", detectedFaceCount: detection.faces.length, usableFaceCount: 0, candidateCount: 0 }); continue; }
      candidates.sort((left, right) => right.medianSimilarity - left.medianSimilarity || left.candidateIndex - right.candidateIndex);
      const best = candidates[0]; const second = candidates[1];
      media.push({ role: item.role, ...(item.profilePhotoIndex === undefined ? {} : { profilePhotoIndex: item.profilePhotoIndex }), status: "FACE_CANDIDATES_AVAILABLE", detectedFaceCount: detection.faces.length, usableFaceCount: candidates.length, candidateCount: candidates.length, bestCandidate: best, ...(second ? { secondBestMedianSimilarity: second.medianSimilarity, bestVsSecondMargin: best.medianSimilarity - second.medianSimilarity } : {}) });
    } catch { media.push({ role: item.role, ...(item.profilePhotoIndex === undefined ? {} : { profilePhotoIndex: item.profilePhotoIndex }), status: "MEDIA_READ_FAILED", detectedFaceCount: 0, usableFaceCount: 0, candidateCount: 0 }); }
  }
  return { ...base, summary: { submittedMediaCount: items.length, processedMediaCount: media.length, mediaWithNoFaceCount: media.filter((item) => item.status === "NO_FACE").length, mediaWithUsableFacesCount: media.filter((item) => item.status === "FACE_CANDIDATES_AVAILABLE").length, multiFaceMediaCount: media.filter((item) => item.detectedFaceCount > 1).length, failedMediaCount: media.filter((item) => item.status === "MEDIA_READ_FAILED").length }, media };
};
