import { ProfileVerificationInferenceError } from "../../errors/profile/ProfileVerificationInferenceError";
import { ProfileVerificationInferenceInputDescriptor, ProfileVerificationInferenceFindings, ProfileVerificationInferenceOutput, ProfileVerificationInferencePipelineManifest } from "./profileVerificationInference.types";

export interface ProfileVerificationInferenceAdapter {
  readonly pipelineManifest: ProfileVerificationInferencePipelineManifest;
  infer(input: Readonly<ProfileVerificationInferenceInputDescriptor>): Promise<ProfileVerificationInferenceFindings | ProfileVerificationInferenceOutput>;
}

/** A technical adapter failure is retriable job work, never a persisted machine finding. */
export const technicalInferenceFailure = (message = "Profile verification inference could not be completed") => (
  new ProfileVerificationInferenceError(message, "TECHNICAL_FAILURE", 503)
);
