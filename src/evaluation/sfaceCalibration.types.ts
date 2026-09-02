export type CalibrationLabel = "MATCH" | "NON_MATCH";
export type CalibrationSample = { sampleId: string; expectedLabel: CalibrationLabel; reference: string; captures: [string, string, string, string, string]; scenario?: string };
export type CalibrationManifest = { schemaVersion: "STHN_SFACE_CALIBRATION_MANIFEST_V1"; samples: CalibrationSample[] };
export type CalibrationSampleResult = { sampleId: string; expectedLabel: CalibrationLabel; scenario: string | null; status: "COMPLETED" | "REFERENCE_UNUSABLE" | "INSUFFICIENT_USABLE_CAPTURES" | "INPUT_INVALID"; usableCaptureCount: number; captureSimilarities: number[]; medianSimilarity: number | null };
export type ThresholdMetrics = { threshold: number; truePositive: number; falsePositive: number; trueNegative: number; falseNegative: number; genuineAutoApprovalRate: number | null; genuineAdminReviewRate: number | null; falseAutomaticApprovalRate: number | null; nonMatchSafeFallbackRate: number | null };
