import { NUDENET_320N, sha256 } from "./specialistRuntimeFeasibility";

export type StageADetection = Readonly<{
  class: string;
  score: number;
  box: readonly [number, number, number, number];
}>;

type IndexedDetection = StageADetection & Readonly<{ classIndex: number }>;

const iou = (a: IndexedDetection, b: IndexedDetection): number => {
  const [ax, ay, aw, ah] = a.box;
  const [bx, by, bw, bh] = b.box;
  const left = Math.max(ax, bx);
  const top = Math.max(ay, by);
  const right = Math.min(ax + aw, bx + bw);
  const bottom = Math.min(ay + ah, by + bh);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  return intersection / (aw * ah + bw * bh - intersection || 1);
};

export const analyzeNudeNetOutput = (
  values: Float32Array,
  originalWidth: number,
  originalHeight: number,
) => {
  if (values.length % 22 !== 0) throw new Error("NudeNet output does not contain 22 channels per anchor");
  const anchors = values.length / 22;
  const side = Math.max(originalWidth, originalHeight);
  let maxNativeClassScore = Number.NEGATIVE_INFINITY;
  const candidates: IndexedDetection[] = [];
  for (let anchor = 0; anchor < anchors; anchor += 1) {
    let classIndex = 0;
    let score = values[4 * anchors + anchor];
    for (let classOffset = 1; classOffset < NUDENET_320N.classes.length; classOffset += 1) {
      const candidate = values[(classOffset + 4) * anchors + anchor];
      if (candidate > score) {
        classIndex = classOffset;
        score = candidate;
      }
    }
    maxNativeClassScore = Math.max(maxNativeClassScore, score);
    if (score < 0.2) continue;
    const cx = values[anchor] * side / 320;
    const cy = values[anchors + anchor] * side / 320;
    const width = values[2 * anchors + anchor] * side / 320;
    const height = values[3 * anchors + anchor] * side / 320;
    const x = Math.max(0, Math.min(cx - width / 2, originalWidth));
    const y = Math.max(0, Math.min(cy - height / 2, originalHeight));
    candidates.push({
      classIndex,
      class: NUDENET_320N.classes[classIndex],
      score,
      box: [x, y, Math.min(width, originalWidth - x), Math.min(height, originalHeight - y)],
    });
  }
  const detections: IndexedDetection[] = [];
  for (const candidate of candidates.sort((a, b) => b.score - a.score)) {
    if (candidate.score >= 0.25 && detections.every((kept) => iou(candidate, kept) <= 0.45)) detections.push(candidate);
  }
  return {
    anchors,
    maxNativeClassScore,
    anchorsAtOrAbove020: candidates.length,
    nmsInputCount: candidates.filter((candidate) => candidate.score >= 0.25).length,
    nmsOutputCount: detections.length,
    detections: detections.map(({ class: className, score, box }) => ({ class: className, score, box })),
    raw: (() => {
      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;
      let sum = 0;
      let finite = 0;
      for (const value of values) {
        if (Number.isFinite(value)) finite += 1;
        min = Math.min(min, value);
        max = Math.max(max, value);
        sum += value;
      }
      return { shape: [1, 22, anchors], count: values.length, finite, min, max, mean: sum / values.length, digest: sha256(Buffer.from(values.buffer, values.byteOffset, values.byteLength)) };
    })(),
  };
};

const relativeDelta = (actual: number, expected: number): number => Math.abs(actual - expected) / Math.max(Math.abs(expected), 1e-12);

export const compareStageADetections = (
  python: readonly StageADetection[],
  node: readonly StageADetection[],
  tolerances: Readonly<{ confidenceAbsolute: number; boxPixelsAbsolute: number }>,
) => {
  const unmatched = new Set(node.map((_, index) => index));
  const failures: string[] = [];
  for (const expected of python) {
    const match = [...unmatched].find((index) => {
      const actual = node[index];
      return actual.class === expected.class &&
        Math.abs(actual.score - expected.score) <= tolerances.confidenceAbsolute &&
        actual.box.every((value, boxIndex) => Math.abs(value - expected.box[boxIndex]) <= tolerances.boxPixelsAbsolute);
    });
    if (match === undefined) failures.push(`No tolerance-bounded Node match for ${expected.class}`);
    else unmatched.delete(match);
  }
  if (unmatched.size) failures.push(`${unmatched.size} unmatched Node detections`);
  return { passed: failures.length === 0, failures };
};

export const rawOutputRelativeDelta = (python: Readonly<{ min: number; max: number; mean: number }>, node: Readonly<{ min: number; max: number; mean: number }>) =>
  Math.max(relativeDelta(node.min, python.min), relativeDelta(node.max, python.max), relativeDelta(node.mean, python.mean));
