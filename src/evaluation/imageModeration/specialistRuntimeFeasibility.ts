import { createHash } from "node:crypto";
import sharp from "sharp";
import * as ort from "onnxruntime-node";

export const NUDENET_320N = Object.freeze({
  wheelSha256: "5937dbd84e5d8e5de038f08ffea5a1bb50a08475776bf2b4795914ce0eaf0331",
  modelSha256: "c15d8273adad2d0a92f014cc69ab2d6c311a06777a55545f2c4eb46f51911f0f",
  classes: ["FEMALE_GENITALIA_COVERED", "FACE_FEMALE", "BUTTOCKS_EXPOSED", "FEMALE_BREAST_EXPOSED", "FEMALE_GENITALIA_EXPOSED", "MALE_BREAST_EXPOSED", "ANUS_EXPOSED", "FEET_EXPOSED", "BELLY_COVERED", "FEET_COVERED", "ARMPITS_COVERED", "ARMPITS_EXPOSED", "FACE_MALE", "BELLY_EXPOSED", "MALE_GENITALIA_EXPOSED", "ANUS_COVERED", "FEMALE_BREAST_COVERED", "BUTTOCKS_COVERED"] as const,
});
export const GANTMAN_120 = Object.freeze({
  zipSha256: "22c0892695929639c16ea302996b8f64df9c52e7a6c1d874c1de1047bfe109f7",
  classes: ["Drawing", "Hentai", "Neutral", "Porn", "Sexy"] as const,
});
export type SyntheticFixture = Readonly<{ id: string; bytes: Buffer; sha256: string; width: number; height: number }>;
export const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");

const pixels = (width: number, height: number, fn: (x: number, y: number) => readonly [number, number, number]) => {
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) { const [r, g, b] = fn(x, y); const i = (y * width + x) * 3; data[i] = r; data[i + 1] = g; data[i + 2] = b; }
  return data;
};
export const createG7SyntheticFixtures = async (): Promise<readonly SyntheticFixture[]> => {
  const source: ReadonlyArray<Readonly<{ id: string; width: number; height: number; fn: (x: number, y: number) => readonly [number, number, number] }>> = [
    { id: "solid-rgb", width: 19, height: 11, fn: () => [32, 96, 160] },
    { id: "gradient", width: 37, height: 23, fn: (x, y) => [Math.round(x * 255 / 36), Math.round(y * 255 / 22), Math.round((x + y) * 255 / 58)] },
    { id: "checker", width: 31, height: 17, fn: (x, y) => (Math.floor(x / 3) + Math.floor(y / 3)) % 2 ? [240, 32, 96] : [16, 192, 64] },
  ];
  return Promise.all(source.map(async ({ id, width, height, fn }) => { const bytes = await sharp(pixels(width, height, fn), { raw: { width, height, channels: 3 } }).png().toBuffer(); return { id, bytes, sha256: sha256(bytes), width, height }; }));
};
export type NudeNetInput = Readonly<{ data: Float32Array; shape: readonly [number, number, number, number]; digest: string; min: number; max: number }>;
/** Node reproduction of the documented source contract; Sharp decode/resize is not asserted bit-identical to OpenCV. */
export const preprocessNudeNet320n = async (bytes: Buffer): Promise<NudeNetInput> => {
  const meta = await sharp(bytes, { failOn: "error" }).metadata(); if (!meta.width || !meta.height) throw new Error("Synthetic fixture has no dimensions");
  const side = Math.max(meta.width, meta.height);
  const raw = await sharp(bytes, { failOn: "error" }).rotate().ensureAlpha().removeAlpha().extend({ right: side - meta.width, bottom: side - meta.height, background: { r: 0, g: 0, b: 0, alpha: 1 } }).resize(320, 320, { fit: "fill", kernel: sharp.kernel.linear }).raw().toBuffer();
  const plane = 320 * 320; const data = new Float32Array(plane * 3);
  for (let i = 0; i < plane; i += 1) { data[i] = raw[i * 3] / 255; data[plane + i] = raw[i * 3 + 1] / 255; data[(plane * 2) + i] = raw[i * 3 + 2] / 255; }
  let min = Number.POSITIVE_INFINITY, max = Number.NEGATIVE_INFINITY; for (const value of data) { min = Math.min(min, value); max = Math.max(max, value); }
  return { data, shape: [1, 3, 320, 320], digest: sha256(Buffer.from(data.buffer)), min, max };
};
type Detection = Readonly<{ classIndex: number; score: number; box: readonly [number, number, number, number] }>;
const iou = (a: Detection, b: Detection) => { const [ax, ay, aw, ah] = a.box, [bx, by, bw, bh] = b.box; const x = Math.max(ax, bx), y = Math.max(ay, by), r = Math.min(ax + aw, bx + bw), bottom = Math.min(ay + ah, by + bh); const intersection = Math.max(0, r - x) * Math.max(0, bottom - y); return intersection / (aw * ah + bw * bh - intersection || 1); };
/** Reference-only reproduction of NudeNet's score/max-class/xywh/NMS defaults; never a STHN policy decision. */
export const postprocessNudeNet320n = (values: readonly number[], originalWidth: number, originalHeight: number): readonly Detection[] => {
  if (values.length % 22 !== 0) throw new Error("NudeNet output does not contain 22 detector channels"); const anchors = values.length / 22, side = Math.max(originalWidth, originalHeight), boxes: Detection[] = [];
  for (let i = 0; i < anchors; i += 1) { let classIndex = 0, score = values[4 * anchors + i]; for (let c = 1; c < NUDENET_320N.classes.length; c += 1) { const candidate = values[(c + 4) * anchors + i]; if (candidate > score) { score = candidate; classIndex = c; } } if (score < 0.2) continue; const cx = values[i] * side / 320, cy = values[anchors + i] * side / 320, width = values[2 * anchors + i] * side / 320, height = values[3 * anchors + i] * side / 320; const x = Math.max(0, Math.min(cx - width / 2, originalWidth)), y = Math.max(0, Math.min(cy - height / 2, originalHeight)); boxes.push({ classIndex, score, box: [x, y, Math.min(width, originalWidth - x), Math.min(height, originalHeight - y)] }); }
  const kept: Detection[] = []; for (const candidate of boxes.sort((a, b) => b.score - a.score)) if (candidate.score >= 0.25 && kept.every(existing => iou(candidate, existing) <= 0.45)) kept.push(candidate); return kept;
};
export const runNudeNetSyntheticSmoke = async (model: string, fixtures: readonly SyntheticFixture[]) => {
  const session = await ort.InferenceSession.create(model, { executionProviders: ["cpu"], enableCpuMemArena: false, enableMemPattern: false });
  if (session.inputNames.length !== 1 || session.inputNames[0] !== "images" || session.outputNames.length !== 1 || session.outputNames[0] !== "output0") throw new Error("NudeNet ONNX graph contract differs from the authorized artifact");
  const results = [] as Array<Record<string, unknown>>;
  for (const fixture of fixtures) { const input = await preprocessNudeNet320n(fixture.bytes); const tensor = new ort.Tensor("float32", input.data, [...input.shape]); let out: ort.Tensor | undefined; try { const first = await session.run({ images: tensor }); out = first.output0 as ort.Tensor; const values = Array.from(out.data as Float32Array); if (values.some((x) => !Number.isFinite(x))) throw new Error("NudeNet emitted non-finite synthetic output"); const detections = postprocessNudeNet320n(values, fixture.width, fixture.height); if (detections.some(d => d.classIndex < 0 || d.classIndex >= NUDENET_320N.classes.length)) throw new Error("NudeNet postprocessing returned an invalid native class index"); const second = await session.run({ images: tensor }); const again = Array.from((second.output0 as ort.Tensor).data as Float32Array); (second.output0 as ort.Tensor).dispose(); if (sha256(Buffer.from(new Float32Array(values).buffer)) !== sha256(Buffer.from(new Float32Array(again).buffer))) throw new Error("NudeNet synthetic output was not exactly repeatable"); results.push({ fixtureId: fixture.id, fixtureSha256: fixture.sha256, input: { shape: input.shape, dtype: "float32", digest: input.digest, min: input.min, max: input.max }, output: { shape: out.dims, dtype: out.type, finite: true, digest: sha256(Buffer.from(new Float32Array(values).buffer)), exactRepeatable: true }, postprocessing: { referenceClassRange: [0, NUDENET_320N.classes.length - 1], referenceScoreThreshold: 0.2, referenceNmsScoreThreshold: 0.25, referenceNmsIouThreshold: 0.45, executedForCrashSafetyOnly: true, detectionCount: detections.length } }); } finally { try { out?.dispose(); } catch {} try { tensor.dispose(); } catch {} } }
  return { graph: { provider: "cpu", inputNames: session.inputNames, inputMetadata: session.inputMetadata, outputNames: session.outputNames, outputMetadata: session.outputMetadata }, results };
};
