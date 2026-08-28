"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.technicalInferenceFailure = void 0;
const ProfileVerificationInferenceError_1 = require("../../errors/profile/ProfileVerificationInferenceError");
/** A technical adapter failure is retriable job work, never a persisted machine finding. */
const technicalInferenceFailure = (message = "Profile verification inference could not be completed") => (new ProfileVerificationInferenceError_1.ProfileVerificationInferenceError(message, "TECHNICAL_FAILURE", 503));
exports.technicalInferenceFailure = technicalInferenceFailure;
