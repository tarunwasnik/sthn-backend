import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { ADAMCODD_V2_RUNTIME_AUTHORITY } from "../evaluation/imageModeration/adamCoddV2RuntimeAuthority";
import { AdamCoddV2ImageSafetyService, type AdamCoddV2RuntimeObserver } from "../services/imageModeration/adamCoddV2ImageSafety.service";

type Decision = "PASS" | "BLOCK";
type ManifestRecord = Readonly<{ candidateId: string; relativePath: string; sha256: string; decision: Decision }>;
type Manifest = Readonly<{ schemaVersion: string; records: readonly ManifestRecord[] }>;
type FrozenNodeReference = Readonly<{
  candidateId: string;
  sha256: string;
  modelSha256: string;
  threshold: number;
  preprocessingId: string;
  decision: Decision;
}>;
type MemorySnapshot = Readonly<{ rssMiB: number; heapUsedMiB: number; heapTotalMiB: number; externalMiB: number; arrayBuffersMiB: number }>;
type SampleResult = Readonly<{ candidateId: string; expectedDecision: Decision; actualDecision: string; decisionMatch: boolean }>;

const ROOT = process.cwd();
const BENCHMARK_ROOT = path.join(ROOT, "evaluation-cache", "image-moderation", "benchmark", "collection-c", "manual-incoming");
const MANIFEST_PATH = path.join(ROOT, "evaluation-cache", "image-moderation", "benchmark", "collection-c", "human-labels", "finalized", "collection-c-evaluation-manifest-v1.json");
const NODE_REFERENCE_ROOT = path.join(ROOT, "evaluation-output", "image-moderation", "i5-v2-preprocessing-compatibility", "run-i3a-node-v2");
const RUNTIME_MODEL_PATH = path.join(ROOT, "models", "adamcodd-v2", "model_int8.onnx");
const DEFAULT_OUTPUT_DIRECTORY = path.join(ROOT, "evaluation-output", "image-moderation", "i3b-5a-v2-runtime-qualification", "latest");
const MIB = 1024 * 1024;

const sha256 = (value: Buffer) => createHash("sha256").update(value).digest("hex");
const milliseconds = (value: number) => Number(value.toFixed(3));
const mib = (value: number) => Number((value / MIB).toFixed(3));
const memory = (): MemorySnapshot => {
  const value = process.memoryUsage();
  return { rssMiB: mib(value.rss), heapUsedMiB: mib(value.heapUsed), heapTotalMiB: mib(value.heapTotal), externalMiB: mib(value.external), arrayBuffersMiB: mib(value.arrayBuffers) };
};
const percentile = (values: readonly number[], ratio: number): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return milliseconds(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)]!);
};
const timingSummary = (values: readonly number[]) => ({ count: values.length, minMs: values.length ? milliseconds(Math.min(...values)) : null, medianMs: percentile(values, 0.5), p95Ms: percentile(values, 0.95), maxMs: values.length ? milliseconds(Math.max(...values)) : null });

const readJson = async <T>(value: string): Promise<T> => JSON.parse(await readFile(value, "utf8")) as T;
const atomicJson = async (destination: string, value: unknown): Promise<void> => {
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, destination);
};
const requiredArgument = (name: string, value: string | undefined): string => {
  if (!value) throw new Error(`${name} requires a value`);
  return value;
};
const parseArguments = (argv: readonly string[]) => {
  let sampleCount = 4;
  let warmRuns = 2;
  let stress = true;
  let outputDirectory = DEFAULT_OUTPUT_DIRECTORY;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--smoke") { sampleCount = 2; warmRuns = 1; stress = false; continue; }
    if (argument === "--sample-count") { sampleCount = Number(requiredArgument(argument, argv[++index])); continue; }
    if (argument === "--warm-runs") { warmRuns = Number(requiredArgument(argument, argv[++index])); continue; }
    if (argument === "--output-dir") { outputDirectory = path.resolve(ROOT, requiredArgument(argument, argv[++index])); continue; }
    if (argument === "--skip-stress") { stress = false; continue; }
    throw new Error(`Unknown argument: ${argument}`);
  }
  if (!Number.isInteger(sampleCount) || sampleCount < 2 || sampleCount > 8 || sampleCount % 2 !== 0) throw new Error("--sample-count must be an even integer from 2 through 8");
  if (!Number.isInteger(warmRuns) || warmRuns < 1 || warmRuns > 5) throw new Error("--warm-runs must be an integer from 1 through 5");
  return { sampleCount, warmRuns, stress, outputDirectory };
};

const validateReference = (value: FrozenNodeReference, record: ManifestRecord): void => {
  if (value.candidateId !== record.candidateId || value.sha256 !== record.sha256
    || value.modelSha256 !== ADAMCODD_V2_RUNTIME_AUTHORITY.artifactSha256
    || value.threshold !== ADAMCODD_V2_RUNTIME_AUTHORITY.nsfwBlockThreshold
    || value.preprocessingId !== ADAMCODD_V2_RUNTIME_AUTHORITY.preprocessingId
    || (value.decision !== "PASS" && value.decision !== "BLOCK")) throw new Error(`Frozen Node V2 reference is invalid for ${record.candidateId}`);
};
const selectFixedSample = async (manifest: Manifest, count: number): Promise<readonly Readonly<{ record: ManifestRecord; reference: FrozenNodeReference; bytes: Buffer }>[]> => {
  const eachDecision = count / 2;
  const selections: Array<Readonly<{ record: ManifestRecord; reference: FrozenNodeReference; bytes: Buffer }>> = [];
  for (const decision of ["PASS", "BLOCK"] as const) {
    const candidates = manifest.records.filter((record) => record.decision === decision).sort((left, right) => left.candidateId.localeCompare(right.candidateId));
    for (const record of candidates) {
      if (selections.filter((selection) => selection.record.decision === decision).length >= eachDecision) break;
      const reference = await readJson<FrozenNodeReference>(path.join(NODE_REFERENCE_ROOT, `${record.candidateId}.json`));
      validateReference(reference, record);
      const bytes = await readFile(path.join(BENCHMARK_ROOT, record.relativePath));
      if (sha256(bytes) !== record.sha256) throw new Error(`Frozen source hash mismatch for ${record.candidateId}`);
      selections.push({ record, reference, bytes });
    }
  }
  if (selections.length !== count) throw new Error("Unable to select the requested fixed qualified sample");
  return selections;
};

const classify = async (service: AdamCoddV2ImageSafetyService, candidate: Readonly<{ record: ManifestRecord; reference: FrozenNodeReference; bytes: Buffer }>): Promise<SampleResult> => {
  const result = await service.classify(candidate.bytes);
  return { candidateId: candidate.record.candidateId, expectedDecision: candidate.reference.decision, actualDecision: result.decision, decisionMatch: result.decision === candidate.reference.decision };
};

void (async () => {
  const configuration = parseArguments(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  const manifest = await readJson<Manifest>(MANIFEST_PATH);
  if (manifest.schemaVersion !== "STHN_COLLECTION_C_EVALUATION_MANIFEST_V1") throw new Error("Unexpected Collection C evaluation manifest schema");
  const artifact = await readFile(RUNTIME_MODEL_PATH);
  const artifactSha256 = sha256(artifact);
  if (artifact.length !== ADAMCODD_V2_RUNTIME_AUTHORITY.artifactBytes || artifactSha256 !== ADAMCODD_V2_RUNTIME_AUTHORITY.artifactSha256) throw new Error("Configured V2 runtime artifact failed frozen identity validation");
  const sample = await selectFixedSample(manifest, configuration.sampleCount);
  const modelLoads: number[] = [];
  const preprocessing: number[] = [];
  const inference: number[] = [];
  const observer: AdamCoddV2RuntimeObserver = {
    onModelSessionReady: (durationMs) => modelLoads.push(durationMs),
    onPreprocessingComplete: (durationMs) => preprocessing.push(durationMs),
    onInferenceComplete: (durationMs) => inference.push(durationMs),
  };
  const service = new AdamCoddV2ImageSafetyService({ modelPath: RUNTIME_MODEL_PATH, observer });
  const before = memory();
  const cpuBefore = process.cpuUsage();
  const coldStarted = performance.now();
  const cold = await classify(service, sample[0]!);
  const coldTotalMs = performance.now() - coldStarted;
  const warm: SampleResult[] = [];
  const warmTotals: number[] = [];
  for (let repetition = 0; repetition < configuration.warmRuns; repetition += 1) {
    for (const candidate of sample) {
      const started = performance.now();
      warm.push(await classify(service, candidate));
      warmTotals.push(performance.now() - started);
    }
  }
  let concurrent: Readonly<{ requested: number; decisions: Readonly<Record<string, number>>; allMatchedFrozenReference: boolean }> | null = null;
  let saturation: Readonly<{ requested: number; unavailable: number; accepted: number; recoveryDecision: string }> | null = null;
  if (configuration.stress) {
    const concurrentResults = await Promise.all(Array.from({ length: 3 }, () => classify(service, sample[0]!)));
    concurrent = { requested: 3, decisions: concurrentResults.reduce<Record<string, number>>((counts, result) => ({ ...counts, [result.actualDecision]: (counts[result.actualDecision] ?? 0) + 1 }), {}), allMatchedFrozenReference: concurrentResults.every((result) => result.decisionMatch) };
    const saturationResults = await Promise.all(Array.from({ length: 11 }, () => service.classify(sample[0]!.bytes)));
    const recovery = await service.classify(sample[0]!.bytes);
    saturation = { requested: 11, unavailable: saturationResults.filter((result) => result.decision === "UNAVAILABLE").length, accepted: saturationResults.filter((result) => result.decision !== "UNAVAILABLE").length, recoveryDecision: recovery.decision };
    if (saturation.unavailable !== 1 || saturation.accepted !== 10 || recovery.decision === "UNAVAILABLE") throw new Error("V2 bounded queue saturation or recovery contract failed");
  }
  const missingArtifact = new AdamCoddV2ImageSafetyService({ modelPath: null });
  const corruptedArtifact = new AdamCoddV2ImageSafetyService({ modelPath: "qualified-corrupt-artifact", readArtifact: async () => Buffer.from("corrupt") });
  const [missingArtifactResult, corruptedArtifactResult] = await Promise.all([missingArtifact.classify(sample[0]!.bytes), corruptedArtifact.classify(sample[0]!.bytes)]);
  if (missingArtifactResult.decision !== "UNAVAILABLE" || corruptedArtifactResult.decision !== "UNAVAILABLE") throw new Error("V2 unavailable-artifact contract failed");
  const cpu = process.cpuUsage(cpuBefore);
  const after = memory();
  const allResults = [cold, ...warm];
  if (!allResults.every((result) => result.decisionMatch)) throw new Error("Runtime V2 decision differs from frozen Node V2 reference");
  const report = {
    schemaVersion: "STHN_I3B_5A_V2_RUNTIME_QUALIFICATION_V1",
    startedAt,
    configuration: { sampleCount: configuration.sampleCount, warmRuns: configuration.warmRuns, stressEnabled: configuration.stress, noAdmissionRoute: true, noCloudinary: true, noMongoDb: true },
    artifact: { path: "models/adamcodd-v2/model_int8.onnx", bytes: artifact.length, sha256: artifactSha256 },
    authority: { modelIdentifier: ADAMCODD_V2_RUNTIME_AUTHORITY.modelIdentifier, revision: ADAMCODD_V2_RUNTIME_AUTHORITY.revision, threshold: ADAMCODD_V2_RUNTIME_AUTHORITY.nsfwBlockThreshold, input: { name: ADAMCODD_V2_RUNTIME_AUTHORITY.inputName, shape: ADAMCODD_V2_RUNTIME_AUTHORITY.inputShape, dtype: "float32" }, output: { name: ADAMCODD_V2_RUNTIME_AUTHORITY.outputName, shape: ADAMCODD_V2_RUNTIME_AUTHORITY.outputShape, dtype: "float32" }, preprocessingId: ADAMCODD_V2_RUNTIME_AUTHORITY.preprocessingId },
    samples: allResults,
    measurements: { coldStartTotalMs: milliseconds(coldTotalMs), modelSessionInitialization: timingSummary(modelLoads), preprocessing: timingSummary(preprocessing), onnxInference: timingSummary(inference), warmClassificationTotal: timingSummary(warmTotals), cpu: { userMs: milliseconds(cpu.user / 1000), systemMs: milliseconds(cpu.system / 1000) }, memory: { before, after, deltaRssMiB: Number((after.rssMiB - before.rssMiB).toFixed(3)) } },
    boundedConcurrency: { concurrent, saturation },
    failureChecks: { missingArtifactDecision: missingArtifactResult.decision, corruptedArtifactDecision: corruptedArtifactResult.decision, noV1Fallback: true },
    conclusion: "LOCAL_QUALIFICATION_EXECUTED_NOT_PRODUCTION_ACTIVATION",
  };
  await atomicJson(path.join(configuration.outputDirectory, "qualification-report.json"), report);
  console.info(JSON.stringify({ status: report.conclusion, outputDirectory: configuration.outputDirectory, sampleCount: sample.length, allFrozenDecisionMatches: true }, null, 2));
})().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown qualification failure";
  console.error(`V2 runtime qualification failed: ${message}`);
  process.exitCode = 1;
});
