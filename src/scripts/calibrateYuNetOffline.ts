import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

import { validateFaceEmbeddingLandmarks } from "../services/profile/profileVerificationFaceEmbedding.service";
import { YUNET_LIMITS } from "../services/profile/profileVerificationYuNet.constants";
import { detectYuNetFaces } from "../services/profile/profileVerificationYuNetRunner";
import { YuNetFace } from "../services/profile/profileVerificationYuNet.types";

type Box = { readonly width: number; readonly height: number; readonly blur: number; readonly occlusion: number; readonly pose: number };
type Entry = { readonly relativePath: string; readonly boxes: readonly Box[] };
type Category = "SINGLE_FACE" | "TWO_FACE" | "MULTI_FACE" | "DIFFICULT_SINGLE_FACE";
type Selected = { readonly relativePath: string; readonly category: Category; readonly annotatedFaceCount: number; readonly coarseSize?: "SMALL" | "MEDIUM" | "LARGE" };
type NegativeSelected = { readonly relativePath: string; readonly sourceCategory: string; readonly expectedFaceCount: 0 };

const [datasetRoot, outputRoot, mode] = process.argv.slice(2);
if (!datasetRoot || !outputRoot) throw new Error("Usage: calibrateYuNetOffline <dataset-root> <output-root>");

const annotationsPath = path.join(datasetRoot, "wider_face_split", "wider_face_val_bbx_gt.txt");
const imagesRoot = path.join(datasetRoot, "WIDER_val", "images");
const caltechRoot = path.join(datasetRoot, "caltech-101", "101_ObjectCategories");
const CALTECH_NEGATIVE_ALLOWLIST = ["barrel", "binocular", "bonsai", "brain", "butterfly", "camera", "car_side", "ceiling_fan", "cellphone", "chair", "chandelier", "cup", "ewer", "gramophone", "headphone", "laptop", "mandolin", "menorah", "metronome", "nautilus", "revolver", "saxophone", "scissors", "stapler", "strawberry", "sunflower", "trilobite", "watch", "wrench", "yin_yang"] as const;
const stable = <T extends { relativePath: string }>(values: readonly T[]) => [...values].sort((a, b) => crypto.createHash("sha256").update(a.relativePath).digest("hex").localeCompare(crypto.createHash("sha256").update(b.relativePath).digest("hex")));
const take = <T>(values: readonly T[], count: number) => values.slice(0, count);

const parse = (source: string): Entry[] => {
  const lines = source.replace(/\r/g, "").split("\n");
  const entries: Entry[] = [];
  for (let line = 0; line < lines.length;) {
    const relativePath = lines[line++]?.trim();
    if (!relativePath) continue;
    const countText = lines[line++]?.trim();
    if (!countText || !/^\d+$/.test(countText)) throw new Error(`Malformed face count for ${relativePath}`);
    const count = Number(countText);
    if (count > 10_000 || line + count > lines.length) throw new Error(`Unsafe annotation bounds for ${relativePath}`);
    const boxes: Box[] = [];
    for (let index = 0; index < count; index += 1) {
      const fields = lines[line++]?.trim().split(/\s+/).map(Number) ?? [];
      if (fields.length !== 10 || fields.some((value) => !Number.isFinite(value))) throw new Error(`Malformed box ${index} for ${relativePath}`);
      boxes.push({ width: fields[2], height: fields[3], blur: fields[4], occlusion: fields[8], pose: fields[9] });
    }
    entries.push({ relativePath, boxes });
  }
  return entries;
};

const select = (entries: readonly Entry[]): Selected[] => {
  const difficult = stable(entries.filter((entry) => entry.boxes.length === 1 && entry.boxes[0].width * entry.boxes[0].height >= 400 && (entry.boxes[0].blur > 0 || entry.boxes[0].occlusion > 0 || entry.boxes[0].pose > 0)));
  const difficultPaths = new Set(take(difficult, 15).map((entry) => entry.relativePath));
  const singles = entries.filter((entry) => entry.boxes.length === 1 && entry.boxes[0].width * entry.boxes[0].height >= 400 && !difficultPaths.has(entry.relativePath));
  const sizes = [...singles].sort((a, b) => a.boxes[0].width * a.boxes[0].height - b.boxes[0].width * b.boxes[0].height);
  const third = Math.floor(sizes.length / 3);
  const oneThird = (values: readonly Entry[], count: number, size: Selected["coarseSize"]) => take(stable(values), count).map((entry) => ({ relativePath: entry.relativePath, category: "SINGLE_FACE" as const, annotatedFaceCount: 1, coarseSize: size }));
  return [
    ...oneThird(sizes.slice(0, third), 8, "SMALL"), ...oneThird(sizes.slice(third, third * 2), 9, "MEDIUM"), ...oneThird(sizes.slice(third * 2), 8, "LARGE"),
    ...take(stable(entries.filter((entry) => entry.boxes.length === 2)), 12).map((entry) => ({ relativePath: entry.relativePath, category: "TWO_FACE" as const, annotatedFaceCount: 2 })),
    ...take(stable(entries.filter((entry) => entry.boxes.length >= 3)), 12).map((entry) => ({ relativePath: entry.relativePath, category: "MULTI_FACE" as const, annotatedFaceCount: entry.boxes.length })),
    ...take(difficult, 15).map((entry) => ({ relativePath: entry.relativePath, category: "DIFFICULT_SINGLE_FACE" as const, annotatedFaceCount: 1 })),
  ];
};

const validLandmarks = (face: YuNetFace) => { try { validateFaceEmbeddingLandmarks(face.landmarks); return true; } catch { return false; } };
const productUsable = (face: YuNetFace, width: number, height: number, usabilityThreshold: number) => {
  const area = face.width * face.height / (width * height);
  const offset = Math.hypot(face.x + face.width / 2 - width / 2, face.y + face.height / 2 - height / 2) / Math.hypot(width / 2, height / 2);
  return face.confidence >= usabilityThreshold && validLandmarks(face) && area >= 0.03 && area <= 0.65 && offset <= 0.35 && face.x > 0 && face.y > 0 && face.x + face.width < width && face.y + face.height < height;
};

const classify = (faces: readonly YuNetFace[], threshold: number) => faces.filter((face) => face.confidence >= threshold);
const aggregate = (rows: readonly { selected: Selected; width: number; height: number; faces: readonly YuNetFace[] }[], category: Category, threshold: number) => {
  const selected = rows.filter((row) => row.selected.category === category);
  const counts = { zero: 0, one: 0, multiple: 0, landmarkInvalid: 0, productUsableAt060: 0, productUsableAt065: 0, productUsableAt070: 0, productUsableAt075: 0, productUsableAt080: 0, productUsableAt085: 0 };
  for (const row of selected) {
    const faces = classify(row.faces, threshold);
    if (faces.length === 0) counts.zero += 1; else if (faces.length === 1) counts.one += 1; else counts.multiple += 1;
    if (faces.length === 1 && !validLandmarks(faces[0])) counts.landmarkInvalid += 1;
    const usabilityCounters: ReadonlyArray<readonly [number, "productUsableAt060" | "productUsableAt065" | "productUsableAt070" | "productUsableAt075" | "productUsableAt080" | "productUsableAt085"]> = [[0.6, "productUsableAt060"], [0.65, "productUsableAt065"], [0.7, "productUsableAt070"], [0.75, "productUsableAt075"], [0.8, "productUsableAt080"], [0.85, "productUsableAt085"]];
    for (const [usability, counter] of usabilityCounters) if (faces.length === 1 && productUsable(faces[0], row.width, row.height, usability)) counts[counter] += 1;
  }
  return { selected: selected.length, ...counts };
};

const selectNegatives = async (): Promise<NegativeSelected[]> => {
  const selected: NegativeSelected[] = [];
  for (const sourceCategory of CALTECH_NEGATIVE_ALLOWLIST) {
    const categoryRoot = path.join(caltechRoot, sourceCategory);
    const files = (await fs.readdir(categoryRoot, { withFileTypes: true })).filter((entry) => entry.isFile() && /\.(jpe?g|png)$/i.test(entry.name)).map((entry) => ({ relativePath: path.join(sourceCategory, entry.name).replace(/\\/g, "/") }));
    const candidate = stable(files)[0];
    if (!candidate) throw new Error(`No image files in approved Caltech category: ${sourceCategory}`);
    const metadata = await sharp(path.join(caltechRoot, candidate.relativePath), { pages: 1, animated: false, failOn: "warning" }).metadata();
    if (!metadata.width || !metadata.height || metadata.width > YUNET_LIMITS.maxWidth || metadata.height > YUNET_LIMITS.maxHeight || metadata.width * metadata.height > YUNET_LIMITS.maxPixels || (metadata.pages && metadata.pages !== 1)) throw new Error(`Approved negative does not meet production decode limits: ${candidate.relativePath}`);
    selected.push({ relativePath: candidate.relativePath, sourceCategory, expectedFaceCount: 0 });
  }
  return selected;
};

const aggregateNegatives = (rows: readonly { selected: NegativeSelected; width: number; height: number; faces: readonly YuNetFace[] }[], threshold: number) => {
  let zero = 0; let one = 0; let multiple = 0; let productUsableFalsePositiveImages = 0; let highestFalseCandidateScore: number | null = null;
  const falsePositiveCases: Array<{ relativePath: string; sourceCategory: string; faceCount: number; scores: number[]; validLandmarks: boolean[]; productUsable: boolean[] }> = [];
  for (const row of rows) {
    const faces = classify(row.faces, threshold);
    if (faces.length === 0) { zero += 1; continue; }
    if (faces.length === 1) one += 1; else multiple += 1;
    const usability = faces.map((face) => productUsable(face, row.width, row.height, 0.85));
    if (usability.some(Boolean)) productUsableFalsePositiveImages += 1;
    highestFalseCandidateScore = Math.max(highestFalseCandidateScore ?? 0, ...faces.map((face) => face.confidence));
    falsePositiveCases.push({ relativePath: row.selected.relativePath, sourceCategory: row.selected.sourceCategory, faceCount: faces.length, scores: faces.map((face) => Number(face.confidence.toFixed(6))), validLandmarks: faces.map(validLandmarks), productUsable: usability });
  }
  return { sampleCount: rows.length, zeroDetections: zero, oneFalseDetection: one, multipleFalseDetections: multiple, falsePositiveImageCount: one + multiple, falsePositiveImageRate: Number(((one + multiple) / rows.length).toFixed(4)), productUsableFalsePositiveImages, highestFalseCandidateScore: highestFalseCandidateScore === null ? null : Number(highestFalseCandidateScore.toFixed(6)), falsePositiveCases };
};

const main = async () => {
  if (mode === "--negatives-only") {
    await fs.mkdir(outputRoot, { recursive: true });
    const negatives = await selectNegatives();
    await fs.writeFile(path.join(outputRoot, "phase-3h-g3-negative-manifest.json"), JSON.stringify({ selection: "one image per conservative object-only category; sha256(relativePath) stable ordering; expectedFaceCount=0", categories: CALTECH_NEGATIVE_ALLOWLIST, selected: negatives }, null, 2));
    const mutableLimits = YUNET_LIMITS as unknown as { scoreThreshold: number };
    const configuredThreshold = mutableLimits.scoreThreshold;
    mutableLimits.scoreThreshold = 0.5;
    const negativeRows: Array<{ selected: NegativeSelected; width: number; height: number; faces: readonly YuNetFace[] }> = [];
    try {
      for (const item of negatives) {
        const detection = await detectYuNetFaces(await fs.readFile(path.join(caltechRoot, item.relativePath)));
        negativeRows.push({ selected: item, width: detection.width, height: detection.height, faces: detection.faces });
      }
    } finally { mutableLimits.scoreThreshold = configuredThreshold; }
    const detectorThresholds = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9];
    const report = {
      runtime: { artifact: "face_detection_yunet_2026may.onnx", configuredDetectorThreshold: configuredThreshold, diagnosticCollectionThreshold: 0.5, nmsIoU: YUNET_LIMITS.nmsThreshold, note: "Faces were produced once through the production YuNet runtime at the lowest evaluated threshold; higher grid classifications filter post-NMS faces by confidence." },
      negativeDataset: { root: caltechRoot, allowlist: CALTECH_NEGATIVE_ALLOWLIST, selectedImages: negatives.length },
      noFaceResults: detectorThresholds.map((threshold) => ({ threshold, ...aggregateNegatives(negativeRows, threshold) })),
    };
    await fs.writeFile(path.join(outputRoot, "phase-3h-g3-report.json"), JSON.stringify(report, null, 2));
    process.stdout.write(JSON.stringify({ selectedNegatives: negatives.length, outputRoot }, null, 2));
    return;
  }
  const entries = parse(await fs.readFile(annotationsPath, "utf8"));
  const missing = entries.filter((entry) => !entry.relativePath || !path.resolve(imagesRoot, entry.relativePath).startsWith(path.resolve(imagesRoot)));
  if (missing.length) throw new Error("Annotation image paths are unsafe");
  const eligible: Entry[] = [];
  let missingImageCount = 0;
  let decodeLimitExcludedCount = 0;
  for (const entry of entries) {
    try {
      const metadata = await sharp(path.join(imagesRoot, entry.relativePath), { pages: 1, animated: false, failOn: "warning" }).metadata();
      if (!metadata.width || !metadata.height || metadata.width > YUNET_LIMITS.maxWidth || metadata.height > YUNET_LIMITS.maxHeight || metadata.width * metadata.height > YUNET_LIMITS.maxPixels || (metadata.pages && metadata.pages !== 1)) { decodeLimitExcludedCount += 1; continue; }
      eligible.push(entry);
    } catch { missingImageCount += 1; }
  }
  const selected = select(eligible);
  if (selected.length !== 64) throw new Error(`Unexpected sample count: ${selected.length}`);
  await fs.mkdir(outputRoot, { recursive: true });
  await fs.writeFile(path.join(outputRoot, "phase-3h-g2-manifest.json"), JSON.stringify({ selection: "sha256(relativePath) stable ordering; single-face raw annotation-area terciles; difficult=blur|occlusion|pose with meaningful box", selected }, null, 2));
  const negatives = await selectNegatives();
  await fs.writeFile(path.join(outputRoot, "phase-3h-g3-negative-manifest.json"), JSON.stringify({ selection: "one image per conservative object-only category; sha256(relativePath) stable ordering; expectedFaceCount=0", categories: CALTECH_NEGATIVE_ALLOWLIST, selected: negatives }, null, 2));
  const mutableLimits = YUNET_LIMITS as unknown as { scoreThreshold: number };
  const configuredThreshold = mutableLimits.scoreThreshold;
  mutableLimits.scoreThreshold = 0.5;
  const rows: Array<{ selected: Selected; width: number; height: number; faces: readonly YuNetFace[] }> = [];
  const negativeRows: Array<{ selected: NegativeSelected; width: number; height: number; faces: readonly YuNetFace[] }> = [];
  try {
    for (const item of selected) {
      const detection = await detectYuNetFaces(await fs.readFile(path.join(imagesRoot, item.relativePath)));
      rows.push({ selected: item, width: detection.width, height: detection.height, faces: detection.faces });
    }
    for (const item of negatives) {
      const detection = await detectYuNetFaces(await fs.readFile(path.join(caltechRoot, item.relativePath)));
      negativeRows.push({ selected: item, width: detection.width, height: detection.height, faces: detection.faces });
    }
  } finally { mutableLimits.scoreThreshold = configuredThreshold; }
  const detectorThresholds = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9];
  const report = {
    runtime: { artifact: "face_detection_yunet_2026may.onnx", configuredDetectorThreshold: configuredThreshold, diagnosticCollectionThreshold: 0.5, nmsIoU: YUNET_LIMITS.nmsThreshold, note: "Faces were produced once through the production YuNet runtime at the lowest evaluated threshold; higher grid classifications filter post-NMS faces by confidence. Lower-confidence candidates cannot suppress higher-confidence faces in score-ordered NMS." },
    validation: { annotationEntries: entries.length, runtimeEligibleAnnotationEntries: eligible.length, missingImageCount, decodeLimitExcludedCount, selectedImages: selected.length, imageRoot: imagesRoot },
    results: detectorThresholds.map((threshold) => ({ threshold, singleFace: aggregate(rows, "SINGLE_FACE", threshold), difficultSingleFace: aggregate(rows, "DIFFICULT_SINGLE_FACE", threshold), twoFace: aggregate(rows, "TWO_FACE", threshold), multiFace: aggregate(rows, "MULTI_FACE", threshold), noFace: aggregateNegatives(negativeRows, threshold) })),
  };
  await fs.writeFile(path.join(outputRoot, "phase-3h-g3-report.json"), JSON.stringify(report, null, 2));
  process.stdout.write(JSON.stringify({ selected: selected.length, outputRoot }, null, 2));
};

void main();
