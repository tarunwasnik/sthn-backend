export const YUNET_ARTIFACT = {
  filename: "face_detection_yunet_2026may.onnx",
  revision: "47534e27c9851bb1128ccc0102f1145e27f23f98",
  sha256: "ebafce4e3c118d6554634be5c27ab333b4c047a9a8c3faf1d7cf93101c22f0f0",
  bytes: 229738,
  identifier: "opencv-zoo-yunet",
  version: "2026may",
} as const;
export const YUNET_PREPROCESSING_VERSION = "YUNET_DYNAMIC_BGR_DIVISOR32_PAD_V1";
export const YUNET_LIMITS = { maxWidth: 2048, maxHeight: 2048, maxPixels: 4_194_304, maxChannels: 4, divisor: 32, scoreThreshold: 0.9, nmsThreshold: 0.3, topK: 200 } as const;
