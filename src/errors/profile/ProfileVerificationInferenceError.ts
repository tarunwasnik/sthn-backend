import { ProfileVerificationInferenceErrorCode } from "../../enums/profileVerificationInference.enums";
import { AppError } from "../../utils/AppError";

export class ProfileVerificationInferenceError extends AppError {
  readonly code: ProfileVerificationInferenceErrorCode;
  readonly retryable: boolean;

  constructor(message: string, code: ProfileVerificationInferenceErrorCode, statusCode = 409, retryable = false) {
    super(message, statusCode);
    this.code = code;
    this.retryable = retryable;
    this.name = "ProfileVerificationInferenceError";
  }
}
