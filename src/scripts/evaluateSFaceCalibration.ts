import path from "node:path";
import { readFile } from "node:fs/promises";
import { parseCalibrationManifest, evaluateThresholds, scoreSummary } from "../evaluation/sfaceCalibration.service";
import { evaluateCalibrationSample } from "../evaluation/sfaceCalibrationRunner.service";
if (process.env.NODE_ENV === "production") throw new Error("SFace calibration is development-only");
const manifestPath = process.argv[2];
if (!manifestPath) throw new Error("Usage: npm run evaluate:sface-calibration -- <manifest.json>");
(async () => {
  const base = path.dirname(path.resolve(manifestPath)); const raw = JSON.parse(await readFile(manifestPath, "utf8")); const manifest = parseCalibrationManifest(raw);
  const results = await Promise.all(manifest.samples.map((sample) => evaluateCalibrationSample({ ...sample, reference: path.resolve(base, sample.reference), captures: sample.captures.map((capture) => path.resolve(base, capture)) as [string,string,string,string,string] })));
  const completed = results.filter((result) => result.status === "COMPLETED"); const positives = completed.filter((result) => result.expectedLabel === "MATCH").map((result) => result.medianSimilarity!); const negatives = completed.filter((result) => result.expectedLabel === "NON_MATCH").map((result) => result.medianSimilarity!);
  console.log(JSON.stringify({ schemaVersion: "STHN_SFACE_CALIBRATION_REPORT_V1", model: "OPENCV_ZOO_SFACE", modelVersion: "face_recognition_sface_2021dec", detector: "STHN_YUNET_DETECTOR_V2", aggregation: "MEDIAN", minimumUsableCaptures: 3, sampleCount: results.length, positiveCount: positives.length, negativeCount: negatives.length, results, positiveStats: scoreSummary(positives), negativeStats: scoreSummary(negatives), thresholds: evaluateThresholds(results) }, null, 2));
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
