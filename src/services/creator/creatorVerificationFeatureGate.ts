import { AppError } from "../../utils/AppError";

/**
 * Creator verification is intentionally dark until the separately approved
 * typed-target index transition has completed and been verified by operators.
 */
export const isCreatorVerificationEnabled = () => false;

export const requireCreatorVerificationEnabled = () => {
  if (!isCreatorVerificationEnabled()) {
    throw new AppError("Creator verification is not available until the verified database index transition is complete", 503, "CREATOR_VERIFICATION_DISABLED");
  }
};
