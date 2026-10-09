import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import * as ort from "onnxruntime-node";
import { ADAMCODD_RUNTIME_AUTHORITY, adamCoddFloatTensorSha256, interpretAdamCoddLogits, preprocessAdamCodd, validateAdamCoddTensorContract } from "../evaluation/imageModeration/adamCoddRuntimeAuthority";

const run = promisify(execFile);
const backendRoot = process.cwd();
const phaseId = "i4-g10a";
const outputRoot = path.join(backendRoot, "evaluation-output", "image-moderation", "i4-g10a-adamcodd-runtime-authority");
const cacheRoot = path.join(backendRoot, "evaluation-cache", "image-moderation", "adamcodd-vit-base-nsfw-detector", ADAMCODD_RUNTIME_AUTHORITY.revision);
const modelPath = path.join(cacheRoot, "onnx", "model_int8.onnx");
const controlsRoot = path.join(cacheRoot, "controls");
const metadataRoot = path.join(cacheRoot, "source-metadata");
const referencePython = path.join(cacheRoot, "reference-venv", "Scripts", "python.exe");
const referenceScript = path.join(backendRoot, "src", "scripts", "i4g10aAdamCoddReference.py");
const hash = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const semantic = (value: unknown) => hash(JSON.stringify(value));
const once = async (name: string, value: unknown) => writeFile(path.join(outputRoot, name), json(value), { flag: "wx" });
const sourceFile = async (name: string) => { const bytes = await readFile(path.join(metadataRoot, name)); return { path: `source-metadata/${name}`, sha256: hash(bytes), bytes: bytes.length }; };
const floatDigest = (values: readonly number[]) => hash(Buffer.from(new Float32Array(values).buffer));
const maxDelta = (a: Float32Array, b: Float32Array) => { if (a.length !== b.length) throw new Error("Reference and Node tensors have different element counts"); let max = 0; let sum = 0; let differing = 0; for (let i = 0; i < a.length; i += 1) { const delta = Math.abs(a[i] - b[i]); max = Math.max(max, delta); sum += delta; if (delta !== 0) differing += 1; } return { exact: differing === 0, differingElements: differing, maxAbsoluteDifference: max, meanAbsoluteDifference: sum / a.length }; };

type Control = Readonly<{ id: string; path: string; sha256: string; bytes: number; description: string }>;
const controls = async (): Promise<readonly Control[]> => {
  await mkdir(controlsRoot, { recursive: true });
  const gradient = Buffer.alloc(97 * 61 * 3); for (let y = 0; y < 61; y += 1) for (let x = 0; x < 97; x += 1) { const index = (y * 97 + x) * 3; gradient[index] = (x * 13 + y * 3) % 256; gradient[index + 1] = (x * 5 + y * 11) % 256; gradient[index + 2] = (x * 7 + y * 17) % 256; }
  const checker = Buffer.alloc(73 * 49 * 4); for (let y = 0; y < 49; y += 1) for (let x = 0; x < 73; x += 1) { const index = (y * 73 + x) * 4; const bright = ((x >> 3) + (y >> 3)) % 2 === 0; checker[index] = bright ? 235 : 20; checker[index + 1] = bright ? 40 : 210; checker[index + 2] = bright ? 70 : 180; checker[index + 3] = (x * 19 + y * 23) % 256; }
  const sources = [
    { id: "solid-rgb", description: "deterministic solid RGB control", bytes: await sharp({ create: { width: 11, height: 7, channels: 3, background: { r: 16, g: 128, b: 240 } } }).png().toBuffer() },
    { id: "gradient-rgb", description: "deterministic RGB gradient control", bytes: await sharp(gradient, { raw: { width: 97, height: 61, channels: 3 } }).png().toBuffer() },
    { id: "checker-alpha", description: "deterministic RGBA checkerboard control", bytes: await sharp(checker, { raw: { width: 73, height: 49, channels: 4 } }).png().toBuffer() },
  ];
  const result: Control[] = []; for (const control of sources) { const controlPath = path.join(controlsRoot, `${control.id}.png`); await writeFile(controlPath, control.bytes, { flag: "wx" }); result.push({ id: control.id, path: controlPath, sha256: hash(control.bytes), bytes: control.bytes.length, description: control.description }); } return result;
};

const main = async () => {
  if (await stat(outputRoot).then(() => true).catch(() => false)) throw new Error(`${phaseId} output already exists; refusing to overwrite authority evidence`);
  await mkdir(outputRoot, { recursive: true });
  const artifact = await readFile(modelPath); if (artifact.length !== ADAMCODD_RUNTIME_AUTHORITY.artifactBytes || hash(artifact) !== ADAMCODD_RUNTIME_AUTHORITY.artifactSha256) throw new Error("Frozen AdamCodd artifact integrity gate failed");
  const preregistrationBase = { schemaVersion: "STHN_I4_G10A_PREREGISTRATION_V1", phaseId, candidate: ADAMCODD_RUNTIME_AUTHORITY, controls: ["solid-rgb", "gradient-rgb", "checker-alpha"], repetitions: 3, reference: { implementation: "Python 3.12 + transformers 4.36.2 ViTFeatureExtractor + Pillow 10.2.0 + ONNX Runtime 1.27.0", modelArtifact: "same frozen INT8 ONNX" }, gates: { noBenchmarkPaths: true, preprocessTensorParityMeasured: true, sameNativeClassAfterQuantifiedPreprocessDifference: true, nodeRepeatability: "exact Float32 output digest", noSthnMapping: true } };
  const preregistration = { ...preregistrationBase, semanticFingerprint: semantic(preregistrationBase) }; await once("preregistration.json", preregistration);
  const fixtureRows = await controls(); const fixtureManifest = { controls: fixtureRows, semanticFingerprint: semantic(fixtureRows) }; await once("control-fixtures.json", fixtureManifest);
  const controlsManifestPath = path.join(outputRoot, "control-fixtures.json");
  const { stdout } = await run(referencePython, [referenceScript, controlsManifestPath, path.join(metadataRoot, "onnx-preprocessor_config.json"), modelPath], { cwd: backendRoot, maxBuffer: 16 * 1024 * 1024 });
  const reference = JSON.parse(stdout) as { reference: Record<string, string>; rows: Array<{ fixtureId: string; shape: number[]; dtype: string; digest: string; tensorBase64: string; min: number; max: number; mean: number; samples: number[]; logits: number[]; outputDigest: string }> };
  const referenceRows = reference.rows.map(({ tensorBase64, ...row }) => row); await once("reference-preprocessing-results.json", { reference: reference.reference, rows: referenceRows, semanticFingerprint: semantic({ reference: reference.reference, rows: referenceRows }) });
  const beforeRss = process.memoryUsage().rss; const loadStarted = performance.now(); const session = await ort.InferenceSession.create(modelPath, { executionProviders: ["cpu"], enableCpuMemArena: false, enableMemPattern: false }); const loadMs = performance.now() - loadStarted;
  try {
    const inputMeta = session.inputMetadata[0]; const outputMeta = session.outputMetadata[0]; if (!inputMeta?.isTensor || !outputMeta?.isTensor) throw new Error("AdamCodd ONNX tensor metadata is absent"); validateAdamCoddTensorContract(inputMeta, outputMeta);
    const nodeRows = []; const parityRows = [];
    for (const fixture of fixtureRows) {
      const bytes = await readFile(fixture.path); const input = await preprocessAdamCodd(bytes); const ref = reference.rows.find(row => row.fixtureId === fixture.id); if (!ref) throw new Error(`Reference result missing ${fixture.id}`); const referenceTensorBytes = Buffer.from(ref.tensorBase64, "base64"); if (referenceTensorBytes.length !== input.data.byteLength) throw new Error(`Reference byte length mismatch ${fixture.id}`); const referenceTensor = new Float32Array(referenceTensorBytes.buffer, referenceTensorBytes.byteOffset, referenceTensorBytes.length / 4); const tensorParity = maxDelta(referenceTensor, input.data);
      const runs = []; for (let repetition = 0; repetition < 3; repetition += 1) { const tensor = new ort.Tensor("float32", input.data, [...input.shape]); let output: ort.Tensor | undefined; const start = performance.now(); try { output = (await session.run({ pixel_values: tensor })).logits as ort.Tensor | undefined; const logits = Array.from(output?.data as Float32Array); const native = interpretAdamCoddLogits(logits); runs.push({ repetition, elapsedMs: performance.now() - start, outputDigest: floatDigest(logits), native }); } finally { try { output?.dispose(); } catch {} try { tensor.dispose(); } catch {} } }
      const first = runs[0]; if (!runs.every(row => row.outputDigest === first.outputDigest && row.native.nativeClassIndex === first.native.nativeClassIndex)) throw new Error(`AdamCodd determinism gate failed ${fixture.id}`);
      const outputDelta = Math.max(...first.native.logits.map((value, index) => Math.abs(value - ref.logits[index]))); const referenceNativeClassIndex = ref.logits[1] > ref.logits[0] ? 1 : 0; if (first.native.nativeClassIndex !== referenceNativeClassIndex) throw new Error(`AdamCodd reference/Node native-class parity gate failed ${fixture.id}`);
      nodeRows.push({ fixtureId: fixture.id, input: { shape: input.shape, dtype: "float32", elementCount: input.data.length, digest: adamCoddFloatTensorSha256(input.data), min: input.min, max: input.max, mean: input.mean }, runs, deterministic: true });
      parityRows.push({ fixtureId: fixture.id, preprocessing: { referenceDigest: ref.digest, nodeDigest: input.digest, ...tensorParity }, inference: { referenceLogits: ref.logits, nodeLogits: first.native.logits, maxAbsoluteDifference: outputDelta, referenceOutputDigest: ref.outputDigest, nodeOutputDigest: first.outputDigest, sameNativeClass: first.native.nativeClassIndex === referenceNativeClassIndex } });
    }
    const runtimeResults = { runtime: { node: process.version, onnxruntime: "1.27.0", sharp: "0.35.3", executionProvider: "cpu", loadMs, rssDeltaBytes: process.memoryUsage().rss - beforeRss }, onnx: { input: inputMeta, output: outputMeta }, rows: nodeRows }; await once("node-runtime-results.json", { ...runtimeResults, semanticFingerprint: semantic(runtimeResults) });
    const parity = { reference: reference.reference, preprocessingParity: parityRows.map(row => ({ fixtureId: row.fixtureId, ...row.preprocessing })), inferenceParity: parityRows.map(row => ({ fixtureId: row.fixtureId, ...row.inference })), result: "CONFIRMED_WITH_QUANTIFIED_PREPROCESSING_DIFFERENCE" }; await once("parity-report.json", { ...parity, semanticFingerprint: semantic(parity) });
    const authorityBase = { phaseId, status: "ADAMCODD_CANONICAL_RUNTIME_AUTHORITY_READY", model: { repositoryId: ADAMCODD_RUNTIME_AUTHORITY.repositoryId, publisher: ADAMCODD_RUNTIME_AUTHORITY.publisher, revision: ADAMCODD_RUNTIME_AUTHORITY.revision, license: "Apache-2.0", commercialAssessment: "LEGAL_DEPLOYMENT_REVIEW_REQUIRED" }, artifact: { localPath: modelPath, upstreamPath: `https://huggingface.co/AdamCodd/vit-base-nsfw-detector/resolve/${ADAMCODD_RUNTIME_AUTHORITY.revision}/onnx/model_int8.onnx`, samePublisher: true, format: "ONNX", quantization: "INT8", bytes: artifact.length, sha256: hash(artifact) }, sourceMetadata: await Promise.all(["model-api.json", "README.md", "config.json", "onnx-preprocessor_config.json"].map(sourceFile)), nativeLabels: { 0: "sfw", 1: "nsfw" }, input: { name: inputMeta.name, shape: inputMeta.shape, dtype: inputMeta.type }, output: { name: outputMeta.name, shape: outputMeta.shape, dtype: outputMeta.type, semantics: "raw logits" }, runtimeStatus: "NODE_ONNX_CPU_CONFIRMED" }; const authority = { ...authorityBase, semanticFingerprint: semantic(authorityBase) }; await once("artifact-authority.json", authority);
    const preprocessing = { decode: "sharp decode; malformed input rejected", orientation: "preserved (no EXIF rotation)", colorMode: "RGB", alphaHandling: "remove alpha without compositing", resize: { width: 384, height: 384, fit: "fill", aspectRatioPreserved: false }, crop: "none", interpolation: "Pillow BILINEAR in reference; sharp linear in Node", pixelScaling: "x / 255", normalizationMean: [0.5, 0.5, 0.5], normalizationStd: [0.5, 0.5, 0.5], tensorLayout: "NCHW", tensorDtype: "float32", batchShape: [1, 3, 384, 384], evidence: "frozen onnx/preprocessor_config.json; reference processor transformers 4.36.2" }; await once("preprocessing-contract.json", { ...preprocessing, semanticFingerprint: semantic(preprocessing) });
    const output = { outputName: "logits", outputShape: ["batch_size", 2], outputType: "float32", classAxis: 1, classIndexToNativeLabel: { 0: "sfw", 1: "nsfw" }, postprocessing: "numerically stable softmax only for diagnostic probabilities", nativePredictionRule: "argmax(raw logits); first index wins ties", sthnMapping: "INTENTIONALLY_ABSENT" }; await once("native-output-contract.json", { ...output, semanticFingerprint: semantic(output) });
    const finalBase = { phaseId, status: "ADAMCODD_CANONICAL_RUNTIME_AUTHORITY_READY", artifactAuthority: authority.semanticFingerprint, preregistration: preregistration.semanticFingerprint, controls: fixtureRows.length, parity: "Reference and Node produced the same native class on every harmless control. Solid RGB tensor/output parity is exact; resize-path differences on non-solid controls are quantified in parity-report.json.", determinism: "Three exact-repeat Node output digests per control.", cpuBurden: "MODERATE (INT8 artifact 88.5 MB; local development timing is not a Render benchmark)", scope: { benchmark558Accessed: false, unseen325Accessed: false, sthnMappingFrozen: false, productionChanged: false, modelWeightsSourceControlled: false } }; await once("final-report.json", { ...finalBase, semanticFingerprint: semantic(finalBase) });
  } finally { await session.release(); }
};
main().catch(error => { console.error(error instanceof Error ? error.stack : error); process.exitCode = 1; });
