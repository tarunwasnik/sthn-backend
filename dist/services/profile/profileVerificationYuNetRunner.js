"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectYuNetFaces = exports.resetYuNetRunnerForTests = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const promises_1 = __importDefault(require("node:fs/promises"));
const ort = __importStar(require("onnxruntime-node"));
const sharp_1 = __importDefault(require("sharp"));
const profileVerificationInferenceAdapter_1 = require("./profileVerificationInferenceAdapter");
const profileVerificationYuNet_constants_1 = require("./profileVerificationYuNet.constants");
let sessionPromise = null;
const iou = (a, b) => {
    const w = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
    const h = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    return (w * h) / Math.max(1, a.width * a.height + b.width * b.height - w * h);
};
const nms = (faces) => {
    const kept = [];
    for (const face of [...faces].sort((a, b) => b.confidence - a.confidence))
        if (kept.every((other) => iou(face, other) < profileVerificationYuNet_constants_1.YUNET_LIMITS.nmsThreshold))
            kept.push(face);
    return kept;
};
const loadSession = async () => {
    if (sessionPromise)
        return sessionPromise;
    sessionPromise = (async () => {
        const path = process.env.STHN_YUNET_MODEL_PATH;
        if (!path)
            throw (0, profileVerificationInferenceAdapter_1.technicalInferenceFailure)("YuNet model artifact is not configured");
        const bytes = await promises_1.default.readFile(path);
        if (bytes.length !== profileVerificationYuNet_constants_1.YUNET_ARTIFACT.bytes || node_crypto_1.default.createHash("sha256").update(bytes).digest("hex") !== profileVerificationYuNet_constants_1.YUNET_ARTIFACT.sha256)
            throw (0, profileVerificationInferenceAdapter_1.technicalInferenceFailure)("YuNet model artifact integrity validation failed");
        const session = await ort.InferenceSession.create(bytes, { executionProviders: ["cpu"] });
        const metadata = session.inputMetadata[0];
        if (session.inputNames.length !== 1 || session.inputNames[0] !== "input" || !metadata?.isTensor || metadata.shape.join(",") !== "1,3,height,width")
            throw (0, profileVerificationInferenceAdapter_1.technicalInferenceFailure)("YuNet model input contract is invalid");
        return session;
    })();
    try {
        return await sessionPromise;
    }
    catch (error) {
        sessionPromise = null;
        throw error;
    }
};
/** Test-only cache reset; production never changes the configured artifact at runtime. */
const resetYuNetRunnerForTests = () => { sessionPromise = null; };
exports.resetYuNetRunnerForTests = resetYuNetRunnerForTests;
const detectYuNetFaces = async (encoded) => {
    try {
        const source = (0, sharp_1.default)(encoded, { limitInputPixels: profileVerificationYuNet_constants_1.YUNET_LIMITS.maxPixels, limitInputChannels: profileVerificationYuNet_constants_1.YUNET_LIMITS.maxChannels, pages: 1, animated: false, failOn: "warning" });
        const metadata = await source.metadata();
        if (!metadata.width || !metadata.height || metadata.width > profileVerificationYuNet_constants_1.YUNET_LIMITS.maxWidth || metadata.height > profileVerificationYuNet_constants_1.YUNET_LIMITS.maxHeight || metadata.width * metadata.height > profileVerificationYuNet_constants_1.YUNET_LIMITS.maxPixels || (metadata.pages && metadata.pages !== 1))
            throw (0, profileVerificationInferenceAdapter_1.technicalInferenceFailure)("Face evidence decode limits exceeded");
        const right = (profileVerificationYuNet_constants_1.YUNET_LIMITS.divisor - (metadata.width % profileVerificationYuNet_constants_1.YUNET_LIMITS.divisor)) % profileVerificationYuNet_constants_1.YUNET_LIMITS.divisor;
        const bottom = (profileVerificationYuNet_constants_1.YUNET_LIMITS.divisor - (metadata.height % profileVerificationYuNet_constants_1.YUNET_LIMITS.divisor)) % profileVerificationYuNet_constants_1.YUNET_LIMITS.divisor;
        const raw = await source.rotate().removeAlpha().toColourspace("srgb").extend({ right, bottom, background: { r: 0, g: 0, b: 0, alpha: 1 } }).raw().toBuffer({ resolveWithObject: true });
        if (raw.info.channels !== 3)
            throw (0, profileVerificationInferenceAdapter_1.technicalInferenceFailure)("Face evidence decoded channel contract is invalid");
        const tensor = new Float32Array(raw.info.width * raw.info.height * 3);
        for (let pixel = 0; pixel < raw.info.width * raw.info.height; pixel += 1) {
            tensor[pixel] = raw.data[pixel * 3 + 2];
            tensor[raw.info.width * raw.info.height + pixel] = raw.data[pixel * 3 + 1];
            tensor[2 * raw.info.width * raw.info.height + pixel] = raw.data[pixel * 3];
        }
        const output = await (await loadSession()).run({ input: new ort.Tensor("float32", tensor, [1, 3, raw.info.height, raw.info.width]) });
        const faces = decode(output, raw.info.width, raw.info.height, metadata.width, metadata.height);
        return { width: metadata.width, height: metadata.height, decodedBytes: raw.data.length, faces };
    }
    catch (error) {
        if (error instanceof Error && error.name === "ProfileVerificationInferenceError")
            throw error;
        throw (0, profileVerificationInferenceAdapter_1.technicalInferenceFailure)();
    }
};
exports.detectYuNetFaces = detectYuNetFaces;
const decode = (output, paddedWidth, paddedHeight, width, height) => {
    const candidates = [];
    for (const stride of [8, 16, 32]) {
        const cls = output[`cls_${stride}`]?.data;
        const obj = output[`obj_${stride}`]?.data;
        const bbox = output[`bbox_${stride}`]?.data;
        const kps = output[`kps_${stride}`]?.data;
        const cols = paddedWidth / stride;
        const rows = paddedHeight / stride;
        const expected = cols * rows;
        if (!cls || !obj || !bbox || !kps || cls.length !== expected || obj.length !== expected || bbox.length !== expected * 4 || kps.length !== expected * 10)
            throw (0, profileVerificationInferenceAdapter_1.technicalInferenceFailure)("YuNet model output contract is invalid");
        for (let index = 0; index < expected; index += 1) {
            const score = Math.sqrt(Math.max(0, Math.min(1, cls[index])) * Math.max(0, Math.min(1, obj[index])));
            if (score < profileVerificationYuNet_constants_1.YUNET_LIMITS.scoreThreshold)
                continue;
            const row = Math.floor(index / cols);
            const column = index % cols;
            const w = Math.exp(bbox[index * 4 + 2]) * stride;
            const h = Math.exp(bbox[index * 4 + 3]) * stride;
            candidates.push({ x: (column + bbox[index * 4]) * stride - w / 2, y: (row + bbox[index * 4 + 1]) * stride - h / 2, width: w, height: h, confidence: score });
        }
    }
    return nms(candidates).slice(0, profileVerificationYuNet_constants_1.YUNET_LIMITS.topK).map((face) => {
        const left = Math.max(0, face.x);
        const top = Math.max(0, face.y);
        const right = Math.min(width, face.x + face.width);
        const bottom = Math.min(height, face.y + face.height);
        return { ...face, x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
    });
};
