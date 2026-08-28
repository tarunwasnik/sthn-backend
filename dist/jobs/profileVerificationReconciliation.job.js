"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.profileVerificationReconciliationJob = void 0;
const profileVerificationJob_service_1 = require("../services/profile/profileVerificationJob.service");
const profileVerificationReconciliationJob = async () => (0, profileVerificationJob_service_1.reconcileProfileVerificationJobs)();
exports.profileVerificationReconciliationJob = profileVerificationReconciliationJob;
