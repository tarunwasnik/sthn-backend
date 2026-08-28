"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadFaceVerificationCapture = exports.cancelCurrentFaceVerificationSession = exports.getFaceVerificationSessionStatus = exports.beginFaceVerificationSession = void 0;
const AppError_1 = require("../utils/AppError");
const catchAsync_1 = require("../utils/catchAsync");
const upload_middleware_1 = require("../middlewares/upload.middleware");
const faceVerificationSession_service_1 = require("../services/profile/faceVerificationSession.service");
exports.beginFaceVerificationSession = (0, catchAsync_1.catchAsync)(async (req, res) => {
    const session = await (0, faceVerificationSession_service_1.startFaceVerificationSession)({ userId: req.user.id, avatar: req.body.avatar });
    res.status(201).json({ session: (0, faceVerificationSession_service_1.toFaceVerificationSessionDto)(session) });
});
exports.getFaceVerificationSessionStatus = (0, catchAsync_1.catchAsync)(async (req, res) => {
    const session = await (0, faceVerificationSession_service_1.getOwnedFaceVerificationSession)({ userId: req.user.id, sessionReference: req.params.sessionReference });
    res.json({ session: (0, faceVerificationSession_service_1.toFaceVerificationSessionDto)(session) });
});
exports.cancelCurrentFaceVerificationSession = (0, catchAsync_1.catchAsync)(async (req, res) => {
    const session = await (0, faceVerificationSession_service_1.cancelFaceVerificationSession)({ userId: req.user.id, sessionReference: req.params.sessionReference });
    res.json({ session: (0, faceVerificationSession_service_1.toFaceVerificationSessionDto)(session) });
});
exports.uploadFaceVerificationCapture = (0, catchAsync_1.catchAsync)(async (req, res) => {
    if (!req.file)
        throw new AppError_1.AppError("A face verification image is required", 400);
    try {
        (0, upload_middleware_1.assertFaceVerificationImageBytes)(req.file);
    }
    catch {
        throw new AppError_1.AppError("Invalid face verification image content", 400);
    }
    const result = await (0, faceVerificationSession_service_1.acceptFaceVerificationCapture)({ userId: req.user.id, sessionReference: req.params.sessionReference, challengeIndex: req.params.challengeIndex, file: req.file });
    res.status(result.replayed ? 200 : 201).json({ session: (0, faceVerificationSession_service_1.toFaceVerificationSessionDto)(result.session), capture: { challengeIndex: result.evidence.challengeIndex, challenge: result.evidence.challenge, receivedAt: result.evidence.captureReceivedAt ?? null }, replayed: result.replayed });
});
