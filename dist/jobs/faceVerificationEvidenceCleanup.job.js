"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.faceVerificationEvidenceCleanupJob = void 0;
const faceVerificationEvidenceCleanup_service_1 = require("../services/profile/faceVerificationEvidenceCleanup.service");
const faceVerificationEvidenceCleanupJob = async () => (0, faceVerificationEvidenceCleanup_service_1.reconcileFaceVerificationEvidenceRetention)();
exports.faceVerificationEvidenceCleanupJob = faceVerificationEvidenceCleanupJob;
