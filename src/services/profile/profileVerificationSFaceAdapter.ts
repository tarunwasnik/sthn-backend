import { ProfileVerificationInferenceError } from "../../errors/profile/ProfileVerificationInferenceError";
import { FaceVerificationChallenge } from "../../models/faceVerificationSession.model";
import { alignFaceEvidence, normalizeFaceEmbeddingL2 } from "./profileVerificationFaceEmbedding.service";
import { getProductionFaceEmbeddingAdapter, SFACE_ARTIFACT, SFACE_FACE_EMBEDDING_SPECIFICATION } from "./profileVerificationFaceEmbeddingAdapter";
import { readProfileVerificationEvidenceBytes } from "./faceVerificationEvidenceRead.service";
import { readAuthoritativeProfileVerificationAvatar } from "./profileVerificationAvatarRead.service";
import { analyseSFaceShadowIdentity } from "./profileVerificationSFaceShadowAnalysis.service";
import { classifyYuNetDetections } from "./profileVerificationYuNetAdapter";
import { detectYuNetFaces } from "./profileVerificationYuNetRunner";
import { YUNET_ARTIFACT, YUNET_PREPROCESSING_VERSION } from "./profileVerificationYuNet.constants";
import { ProfileVerificationInferenceAdapter, technicalInferenceFailure } from "./profileVerificationInferenceAdapter";
import { ProfileVerificationInferenceInputDescriptor } from "./profileVerificationInference.types";
import { YuNetDetection } from "./profileVerificationYuNet.types";

type EvidenceReader = typeof readProfileVerificationEvidenceBytes;
type AvatarReader = typeof readAuthoritativeProfileVerificationAvatar;
type Detector = (bytes: Buffer) => Promise<YuNetDetection>;

const unable = (reasonCode: string, reason: string) => ({
  status: "COMPLETED" as const, conclusion: "UNABLE_TO_DETERMINE" as const,
  model: { identifier: SFACE_ARTIFACT.identifier, version: SFACE_ARTIFACT.version }, processedAt: new Date(), reasonCode, reason,
});

/** Existing inference adapter contract, now backed by current-avatar versus exact-five-capture SFace work. */
export const createSFaceProfileVerificationAdapter = (dependencies: { evidenceReader?: EvidenceReader; avatarReader?: AvatarReader; detector?: Detector } = {}): ProfileVerificationInferenceAdapter => {
  const evidenceReader = dependencies.evidenceReader ?? readProfileVerificationEvidenceBytes;
  const avatarReader = dependencies.avatarReader ?? readAuthoritativeProfileVerificationAvatar;
  const detector = dependencies.detector ?? detectYuNetFaces;
  const embedder = getProductionFaceEmbeddingAdapter();
  return {
    pipelineManifest: {
      kind: "MODEL_RUNTIME", pipelineVersion: "STHN_SFACE_SHADOW_MEDIAN_3_NO_THRESHOLD_V1", runtimeIdentifier: "onnxruntime-node", runtimeVersion: "1.27.0",
      preprocessingVersion: "YUNET_5PT_SFACE_112_BGR_L2_COSINE_MEDIAN_MIN3_NO_THRESHOLD_V1",
      detector: { identifier: YUNET_ARTIFACT.identifier, version: YUNET_ARTIFACT.version, artifactSha256: YUNET_ARTIFACT.sha256 },
      embedding: { identifier: SFACE_ARTIFACT.identifier, version: SFACE_ARTIFACT.version, artifactSha256: SFACE_ARTIFACT.sha256 },
    },
    async infer(input: Readonly<ProfileVerificationInferenceInputDescriptor>) {
      const source = await evidenceReader({ verificationRequestId: input.verificationRequestId });
      if (source.noOp) throw new ProfileVerificationInferenceError("Verification submission is no longer actionable", source.noOp, 409);
      if (!source.evidence || source.evidence.length !== 5) throw technicalInferenceFailure("SFace evidence is unavailable");
      const detected: Array<{ challengeIndex: number; challenge: FaceVerificationChallenge; detection: YuNetDetection; bytes: Buffer }> = [];
      for (const evidence of source.evidence) {
        const expected = input.captures[evidence.challengeIndex];
        if (!expected || expected.challenge !== evidence.challenge) throw technicalInferenceFailure("SFace evidence binding is inconsistent");
        detected.push({ challengeIndex: evidence.challengeIndex, challenge: evidence.challenge, bytes: evidence.bytes, detection: await detector(evidence.bytes) });
      }
      const findings = classifyYuNetDetections(detected.map(({ challengeIndex, challenge, detection }) => ({ challengeIndex, challenge, detection })));
      let avatarDetection: YuNetDetection;
      try { avatarDetection = await detector(await avatarReader(input)); }
      catch (error) {
        if (error instanceof ProfileVerificationInferenceError && ["STALE_SUBMISSION", "TERMINAL_REQUEST"].includes(error.code)) throw error;
        return { findings: { ...findings, avatar: { status: "NO_USABLE_FACE" } }, shadowIdentityAnalysis: unable("REFERENCE_AVATAR_UNAVAILABLE", "The authoritative submitted avatar could not be processed.") };
      }
      if (avatarDetection.faces.length === 0) return { findings: { ...findings, avatar: { status: "NO_USABLE_FACE" } }, shadowIdentityAnalysis: unable("REFERENCE_FACE_NOT_FOUND", "The authoritative submitted avatar has no usable face.") };
      if (avatarDetection.faces.length !== 1) return { findings: { ...findings, avatar: { status: "MULTIPLE_FACES" } }, shadowIdentityAnalysis: unable("MULTIPLE_REFERENCE_FACES", "The authoritative submitted avatar has multiple faces.") };
      let reference: number[];
      try {
        const avatarBytes = await avatarReader(input);
        reference = normalizeFaceEmbeddingL2(await embedder.infer(await alignFaceEvidence({ bytes: avatarBytes, landmarks: avatarDetection.faces[0].landmarks, preprocessing: SFACE_FACE_EMBEDDING_SPECIFICATION.preprocessing })), 128);
      } catch { return { findings: { ...findings, avatar: { status: "NO_USABLE_FACE" } }, shadowIdentityAnalysis: unable("REFERENCE_ALIGNMENT_UNAVAILABLE", "The authoritative submitted avatar could not be aligned for analysis.") }; }
      const embeddings: number[][] = [];
      for (const capture of detected) {
        if (findings.captures[capture.challengeIndex]?.usability !== "USABLE" || capture.detection.faces.length !== 1) continue;
        try { embeddings.push(normalizeFaceEmbeddingL2(await embedder.infer(await alignFaceEvidence({ bytes: capture.bytes, landmarks: capture.detection.faces[0].landmarks, preprocessing: SFACE_FACE_EMBEDDING_SPECIFICATION.preprocessing })), 128)); }
        catch { /* A single malformed capture is unusable, not an attempt-level identity verdict. */ }
      }
      return { findings: { ...findings, avatar: { status: "MATCH_UNCERTAIN" } }, shadowIdentityAnalysis: analyseSFaceShadowIdentity({ referenceEmbedding: reference, usableCaptureEmbeddings: embeddings, threshold: null }) };
    },
  };
};
