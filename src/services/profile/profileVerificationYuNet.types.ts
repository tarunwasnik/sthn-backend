import { FaceVerificationChallenge } from "../../models/faceVerificationSession.model";

/**
 * YuNet's five-keypoint tensor order is fixed by its model output layout:
 * right eye, left eye, nose tip, right mouth corner, left mouth corner.
 * These coordinates are runtime-only detector output; they are never persisted.
 */
export interface YuNetFaceLandmarks {
  rightEye: { x: number; y: number };
  leftEye: { x: number; y: number };
  noseTip: { x: number; y: number };
  rightMouthCorner: { x: number; y: number };
  leftMouthCorner: { x: number; y: number };
}

export interface YuNetFace {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  /** Optional for legacy detector-only fixtures; the runner always supplies it. */
  landmarks?: YuNetFaceLandmarks;
}
export interface YuNetDetection { width: number; height: number; decodedBytes: number; faces: readonly YuNetFace[]; }
export interface YuNetEvidenceInput { challengeIndex: number; challenge: FaceVerificationChallenge; bytes: Buffer; }
