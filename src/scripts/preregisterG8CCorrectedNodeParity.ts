import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const hash = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
const root = process.cwd();
const read = async (relative: string): Promise<Buffer> => readFile(path.join(root, relative));

void (async () => {
  const paths = {
    g7: "evaluation-output/image-moderation/i4-g7-specialist-runtime-feasibility/g7-specialist-runtime-feasibility.json",
    g8aR1: "evaluation-output/image-moderation/i4-g8a-r1-evidence-authority-recovery/g8a-r1-authority-recovery.json",
    g8b: "evaluation-output/image-moderation/i4-g8b-nudenet-reference-parity/g8b-nudenet-reference-parity.json",
    g8bPrereq: "evaluation-output/image-moderation/i4-g8b-nudenet-reference-parity/g8b-preregistration.json",
    python: "evaluation-output/image-moderation/i4-g8b-nudenet-reference-parity/g8b-python-reference.json",
    model: "evaluation-cache/image-moderation/specialists/nudenet-320n/320n.onnx",
    implementation: "src/evaluation/imageModeration/nudeNet320nCorrectedPreprocess.ts",
  } as const;
  const [g7, g8aR1, g8b, g8bPrereq, python, model, implementation] = await Promise.all(
    Object.values(paths).map(read),
  );
  const expected = {
    g7: "c007c6b47c4a31e3344c0fe0c55043ab051d6a0fe4352185d25d64ffbfcd2794",
    g8b: "7e4686fcf5ffd0c07ef851929ee7cd27a0e5dc8739a1efe0a0bc7b9b9caf1d5f",
    g8bPrereq: "b7002420157e3b9f05d6e82d8703bccef05bd34ac6d2ec241e6937413c9a5623",
    python: "075cdae4e00290ce9da50c628f434e20e9c5582d237c48f224d7ba901d69a0db",
    model: "c15d8273adad2d0a92f014cc69ab2d6c311a06777a55545f2c4eb46f51911f0f",
  };
  if (hash(g7) !== expected.g7 || hash(g8b) !== expected.g8b || hash(g8bPrereq) !== expected.g8bPrereq || hash(python) !== expected.python || hash(model) !== expected.model) {
    throw new Error("Frozen G8-C authority identity mismatch");
  }
  const g8aR1Record = JSON.parse(g8aR1.toString("utf8"));
  const g8bRecord = JSON.parse(g8b.toString("utf8"));
  const g8bPrereqRecord = JSON.parse(g8bPrereq.toString("utf8"));
  if (g8aR1Record.semanticEvidenceFingerprint !== "221f8b2ce4d8f8323e0087752cffe8d035d4c1a12aa1c347eac02f072f470d1b" ||
      g8bRecord.reportFingerprint !== "49d7d6e861c17fddc90d28fa2126315f3444183c2f70e0a8f7cad0e010a73f02" ||
      g8bPrereqRecord.preregistrationFingerprint !== "e7c26c7d791c442e0d4b27eace92f5d1135907754813a2dc03adc06bc3c513e3") {
    throw new Error("Frozen G8-C semantic authority mismatch");
  }
  const selected = g8bPrereqRecord.selection.selected;
  if (!Array.isArray(selected) || selected.length !== 16 || new Set(selected.map((item: { candidateId: string }) => item.candidateId)).size !== 16) {
    throw new Error("G8-B frozen subset must contain exactly 16 unique candidates");
  }
  const payload = {
    schemaVersion: "STHN_I4_G8C_STAGE_A_PREREGISTRATION_V1",
    phase: "I4-G8-C",
    purpose: "CORRECTED_NODE_PREPROCESSING_PARITY_ONLY",
    authority: {
      g7Sha256: expected.g7,
      g8aR1SemanticFingerprint: g8aR1Record.semanticEvidenceFingerprint,
      g8bSemanticFingerprint: g8bRecord.reportFingerprint,
      g8bFinalSha256: expected.g8b,
      g8bPreregistrationFingerprint: g8bPrereqRecord.preregistrationFingerprint,
      g8bPreregistrationSha256: expected.g8bPrereq,
      canonicalPythonReferenceSha256: expected.python,
      nudeNet320nModelSha256: expected.model,
      v1CandidateFingerprint: "c38c21141d65e25b2a0dbf5c1fc90847a3920f8fe4dfe437a9cc9cdf2deb5c5b",
      correctedImplementationSha256: hash(implementation),
    },
    subset: { count: 16, candidateIds: selected.map((item: { candidateId: string }) => item.candidateId) },
    correctedPreprocessing: {
      noExplicitExifAutoRotation: true,
      decode: "Sharp decode; remove alpha; sRGB raw output; verify width, height, channels===3, exact buffer length",
      squarePadding: "materialized right/bottom black RGB padding from origin (0,0)",
      resize: "new Sharp instance from verified square RGB raw image; 320x320 linear interpolation",
      tensor: "verified interleaved RGB to float32 RGB NCHW [1,3,320,320], byte/255",
      prohibitedAfterInference: "No preprocessing modification after corrected Node outputs become visible",
      historicalDefects: [
        "Unverified raw channel/stride assumption corrupted RGB-plane construction",
        "Single-pipeline Sharp ordering produced 320x780 rather than square-then-resized 320x320 geometry",
      ],
    },
    comparison: {
      fields: ["source geometry", "tensor shape/statistics", "raw output", "candidate filter", "NMS inputs", "detections", "class", "confidence", "box"],
      numericalTolerances: { tensorStatisticsAbsolute: 0.02, confidenceAbsolute: 0.02, boxPixelsAbsolute: 3, rawOutputRelative: 0.02 },
      successCriterion: "Material parity with canonical Python across the exact 16-candidate frozen subset; nonzero detections alone are insufficient",
    },
    prohibitions: { thresholdTuning: false, candidateChanges: false, stageBBeforeStageAPasses: false, unseen: false, g3: false, gantMan: false, owen: false, e5o: false, training: false, production: false },
  };
  const report = { ...payload, preregistrationFingerprint: hash(JSON.stringify(payload)) };
  const out = path.join(root, "evaluation-output", "image-moderation", "i4-g8c-corrected-nudenet-development-evaluation");
  await mkdir(out, { recursive: true });
  await writeFile(path.join(out, "g8c-stage-a-preregistration.json"), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ preregistrationFingerprint: report.preregistrationFingerprint, subsetCount: report.subset.count }));
})().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
