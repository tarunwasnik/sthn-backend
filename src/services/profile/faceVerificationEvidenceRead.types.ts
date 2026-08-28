import { FaceVerificationChallenge } from "../../models/faceVerificationSession.model";
import { FaceVerificationImageFormat, FaceVerificationImageMimeType } from "./faceVerificationEvidenceValidation.service";

export interface FaceVerificationEvidenceBytesDescriptor {
  challengeIndex: number;
  challenge: FaceVerificationChallenge;
  mimeType: FaceVerificationImageMimeType;
  format: FaceVerificationImageFormat;
  byteLength: number;
  bytes: Buffer;
}
