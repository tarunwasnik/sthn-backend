"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProfileVerificationInferenceError = void 0;
const AppError_1 = require("../../utils/AppError");
class ProfileVerificationInferenceError extends AppError_1.AppError {
    constructor(message, code, statusCode = 409, retryable = false) {
        super(message, statusCode);
        this.code = code;
        this.retryable = retryable;
        this.name = "ProfileVerificationInferenceError";
    }
}
exports.ProfileVerificationInferenceError = ProfileVerificationInferenceError;
