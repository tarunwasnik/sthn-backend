import { setBiometricReferenceAvatarValidationDependenciesForTests } from "../../../services/profile/profileVerificationReferenceAvatarValidation.service";

const validReferenceDetection = {
  width: 100, height: 100, decodedBytes: 30_000,
  faces: [{ x: 30, y: 30, width: 40, height: 40, confidence: .9, landmarks: { rightEye: { x: 40, y: 42 }, leftEye: { x: 55, y: 42 }, noseTip: { x: 48, y: 50 }, rightMouthCorner: { x: 42, y: 60 }, leftMouthCorner: { x: 54, y: 60 } } }],
} as const;

export const installReferenceAvatarTestFixture = () => setBiometricReferenceAvatarValidationDependenciesForTests({
  reader: async () => Buffer.from("reference-avatar-test-fixture"),
  detector: async () => validReferenceDetection,
});

export const resetReferenceAvatarTestFixture = () => setBiometricReferenceAvatarValidationDependenciesForTests();
