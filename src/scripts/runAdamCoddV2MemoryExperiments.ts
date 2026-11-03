import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import sharp from "sharp";

import { ADAMCODD_V2_RUNTIME_AUTHORITY } from "../evaluation/imageModeration/adamCoddV2RuntimeAuthority";
import { AdamCoddV2ImageSafetyService, type AdamCoddV2RuntimeObserver } from "../services/imageModeration/adamCoddV2ImageSafety.service";
import { resolveCollectionCQualificationAsset } from "./collectionCQualificationPath";

type Decision = "PASS" | "BLOCK";
type ManifestRecord = Readonly<{ candidateId: string; relativePath: string; sha256: string; decision: Decision }>;
type Manifest = Readonly<{ schemaVersion: string; records: readonly ManifestRecord[] }>;
type FrozenReference = Readonly<{ candidateId: string; sha256: string; modelSha256: string; threshold: number; preprocessingId: string; decision: Decision }>;
type Memory = Readonly<{ rssMiB: number; heapUsedMiB: number; heapTotalMiB: number; externalMiB: number; arrayBuffersMiB: number }>;
type Experiment = Readonly<{
  id: string;
  onnx: Readonly<{ intraOpNumThreads?: number; interOpNumThreads?: number }>;
  sharpCache: "DEFAULT" | "DISABLED";
  sharpConcurrency: "DEFAULT" | 1 | 2;
  inferenceConcurrency: 1 | 2;
}>;
type Sample = Readonly<{ candidateId: string; sha256: string; bytes: Buffer; expectedDecision: Decision }>;
type Pressure = "NORMAL" | "QUEUE" | "SATURATION";

const ROOT = process.cwd();
const SCRIPT = path.resolve(__filename);
const BENCHMARK_ROOT = path.join(ROOT, "evaluation-cache", "image-moderation", "benchmark", "collection-c", "manual-incoming");
const MANIFEST_PATH = path.join(ROOT, "evaluation-cache", "image-moderation", "benchmark", "collection-c", "human-labels", "finalized", "collection-c-evaluation-manifest-v1.json");
const REFERENCE_ROOT = path.join(ROOT, "evaluation-output", "image-moderation", "i5-v2-preprocessing-compatibility", "run-i3a-node-v2");
const MODEL_PATH = path.join(ROOT, "models", "adamcodd-v2", "model_int8.onnx");
const OUTPUT = path.join(ROOT, "evaluation-output", "image-moderation", "i3b-5c-v2-memory-experiments", "latest");
const SAFE_RSS_LIMIT_MIB = 1536;
const MIB = 1024 * 1024;

const EXPERIMENTS: readonly Experiment[] = [
  { id: "baseline-defaults", onnx: {}, sharpCache: "DEFAULT", sharpConcurrency: "DEFAULT", inferenceConcurrency: 2 },
  { id: "onnx-threads-1-1", onnx: { intraOpNumThreads: 1, interOpNumThreads: 1 }, sharpCache: "DEFAULT", sharpConcurrency: "DEFAULT", inferenceConcurrency: 2 },
  { id: "onnx-threads-2-1", onnx: { intraOpNumThreads: 2, interOpNumThreads: 1 }, sharpCache: "DEFAULT", sharpConcurrency: "DEFAULT", inferenceConcurrency: 2 },
  { id: "sharp-cache-disabled", onnx: {}, sharpCache: "DISABLED", sharpConcurrency: "DEFAULT", inferenceConcurrency: 2 },
  { id: "sharp-concurrency-1", onnx: {}, sharpCache: "DEFAULT", sharpConcurrency: 1, inferenceConcurrency: 2 },
  { id: "sharp-concurrency-2", onnx: {}, sharpCache: "DEFAULT", sharpConcurrency: 2, inferenceConcurrency: 2 },
  { id: "inference-capacity-1", onnx: {}, sharpCache: "DEFAULT", sharpConcurrency: "DEFAULT", inferenceConcurrency: 1 },
];

/**
 * Worker-only combinations used by the follow-up validation harness. They are
 * intentionally excluded from the original seven-experiment I3B-5C schedule.
 */
const VALIDATION_EXPERIMENTS: readonly Experiment[] = [
  { id: "sharp-cache-disabled-onnx-threads-1-1", onnx: { intraOpNumThreads: 1, interOpNumThreads: 1 }, sharpCache: "DISABLED", sharpConcurrency: "DEFAULT", inferenceConcurrency: 2 },
  { id: "sharp-cache-disabled-onnx-threads-2-1", onnx: { intraOpNumThreads: 2, interOpNumThreads: 1 }, sharpCache: "DISABLED", sharpConcurrency: "DEFAULT", inferenceConcurrency: 2 },
  { id: "sharp-cache-disabled-inference-capacity-1", onnx: {}, sharpCache: "DISABLED", sharpConcurrency: "DEFAULT", inferenceConcurrency: 1 },
];
const WORKER_EXPERIMENTS: readonly Experiment[] = [...EXPERIMENTS, ...VALIDATION_EXPERIMENTS];

const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const round = (value: number) => Number(value.toFixed(3));
const memory = (): Memory => {
  const value = process.memoryUsage();
  return { rssMiB: round(value.rss / MIB), heapUsedMiB: round(value.heapUsed / MIB), heapTotalMiB: round(value.heapTotal / MIB), externalMiB: round(value.external / MIB), arrayBuffersMiB: round(value.arrayBuffers / MIB) };
};
const sleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
const readJson = async <T>(file: string): Promise<T> => JSON.parse(await readFile(file, "utf8")) as T;
const atomicJson = async (file: string, value: unknown): Promise<void> => {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, file);
};
const statistics = (values: readonly number[]) => {
  const sorted = [...values].sort((left, right) => left - right);
  const percentile = (ratio: number) => sorted.length ? round(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)]!) : null;
  return { count: values.length, minMs: values.length ? round(Math.min(...values)) : null, medianMs: percentile(0.5), p95Ms: percentile(0.95), maxMs: values.length ? round(Math.max(...values)) : null };
};
const argument = (argv: readonly string[], name: string): string | undefined => {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
};
const parse = (argv: readonly string[]) => {
  const worker = argument(argv, "--worker");
  const experiment = argument(argv, "--experiment");
  const outputDirectory = path.resolve(ROOT, argument(argv, "--output-dir") ?? OUTPUT);
  const smoke = argv.includes("--smoke");
  const pressure = (argument(argv, "--pressure") ?? "NORMAL") as Pressure;
  if (worker !== undefined && worker !== "v2") throw new Error("--worker must be v2");
  if (worker !== undefined && !experiment) throw new Error("--worker requires --experiment");
  if (experiment && !WORKER_EXPERIMENTS.some((candidate) => candidate.id === experiment)) throw new Error("Unknown experiment identifier");
  if (!["NORMAL", "QUEUE", "SATURATION"].includes(pressure)) throw new Error("--pressure must be NORMAL, QUEUE, or SATURATION");
  if (worker === undefined && pressure !== "NORMAL") throw new Error("--pressure is available only to a worker");
  return { worker: worker === "v2", experiment, outputDirectory, smoke, pressure };
};
const findExperiment = (id: string): Experiment => {
  const value = WORKER_EXPERIMENTS.find((candidate) => candidate.id === id);
  if (!value) throw new Error(`Unknown experiment: ${id}`);
  return value;
};

const loadSample = async (): Promise<readonly Sample[]> => {
  const manifest = await readJson<Manifest>(MANIFEST_PATH);
  if (manifest.schemaVersion !== "STHN_COLLECTION_C_EVALUATION_MANIFEST_V1") throw new Error("Unexpected Collection C manifest schema");
  const selected: Sample[] = [];
  for (const decision of ["PASS", "BLOCK"] as const) {
    const candidates = manifest.records.filter((record) => record.decision === decision).sort((left, right) => left.candidateId.localeCompare(right.candidateId));
    for (const record of candidates.slice(0, 2)) {
      const reference = await readJson<FrozenReference>(path.join(REFERENCE_ROOT, `${record.candidateId}.json`));
      if (reference.candidateId !== record.candidateId || reference.sha256 !== record.sha256 || reference.modelSha256 !== ADAMCODD_V2_RUNTIME_AUTHORITY.artifactSha256 || reference.threshold !== ADAMCODD_V2_RUNTIME_AUTHORITY.nsfwBlockThreshold || reference.preprocessingId !== ADAMCODD_V2_RUNTIME_AUTHORITY.preprocessingId || reference.decision !== record.decision) throw new Error(`Frozen V2 reference mismatch for ${record.candidateId}`);
      const bytes = await readFile(resolveCollectionCQualificationAsset(BENCHMARK_ROOT, record.relativePath));
      if (hash(bytes) !== record.sha256) throw new Error(`Frozen source hash mismatch for ${record.candidateId}`);
      selected.push({ candidateId: record.candidateId, sha256: record.sha256, bytes, expectedDecision: reference.decision });
    }
  }
  if (selected.length !== 4) throw new Error("The fixed four-image sample is incomplete");
  return selected;
};

const applySharp = (experiment: Experiment): Readonly<{ cache: string; concurrency: number }> => {
  if (experiment.sharpCache === "DISABLED") sharp.cache(false);
  if (experiment.sharpConcurrency !== "DEFAULT") sharp.concurrency(experiment.sharpConcurrency);
  const cache = sharp.cache();
  return { cache: JSON.stringify(cache), concurrency: sharp.concurrency() };
};

const writeMarkdown = async (outputDirectory: string, reports: readonly Record<string, unknown>[]): Promise<void> => {
  const rows = reports.map((report) => {
    const measurements = report.measurements as Record<string, Record<string, number | null>> | undefined;
    const memoryReport = report.memory as Record<string, number> | undefined;
    const configuration = report.configuration as Record<string, unknown> | undefined;
    return {
      id: String(configuration?.id ?? "unknown"),
      status: String(report.status ?? "UNKNOWN"),
      valid: report.referenceAgreement === true,
      peak: Number(memoryReport?.peakRssMiB ?? Number.POSITIVE_INFINITY),
      warm: Number(measurements?.warmClassification?.medianMs ?? Number.POSITIVE_INFINITY),
    };
  }).sort((left, right) => (Number(right.valid) - Number(left.valid)) || (left.peak - right.peak) || (left.warm - right.warm));
  const body = [
    "# AdamCodd V2 controlled memory experiments",
    "",
    "Ranking is descriptive only: valid frozen-decision agreement first, then sampled peak RSS, then warm median latency. It is not a production-selection decision.",
    "",
    "| Rank | Experiment | Status | Frozen decisions | Sampled peak RSS MiB | Warm median ms |",
    "|---:|---|---|---|---:|---:|",
    ...rows.map((row, index) => `| ${index + 1} | ${row.id} | ${row.status} | ${row.valid ? "match" : "invalid"} | ${Number.isFinite(row.peak) ? row.peak.toFixed(3) : "n/a"} | ${Number.isFinite(row.warm) ? row.warm.toFixed(3) : "n/a"} |`),
    "",
    "All runs are isolated child processes. Reported peak RSS is sampled, not an absolute process maximum.",
    "",
  ].join("\n");
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(path.join(outputDirectory, "comparison-report.md"), body, "utf8");
};

const runWorker = async (experiment: Experiment, smoke: boolean, outputDirectory: string, pressure: Pressure): Promise<void> => {
  const artifact = await readFile(MODEL_PATH);
  if (artifact.length !== ADAMCODD_V2_RUNTIME_AUTHORITY.artifactBytes || hash(artifact) !== ADAMCODD_V2_RUNTIME_AUTHORITY.artifactSha256) throw new Error("V2 artifact identity mismatch");
  const sharpSettings = applySharp(experiment);
  const sample = await loadSample();
  // Keep the smoke run small while exercising both frozen decisions. The full
  // workload uses the complete, fixed two-PASS/two-BLOCK sample.
  const activeSample = smoke ? [sample[0]!, sample[2]!] : sample;
  const sessionTimes: number[] = [];
  const preprocessTimes: number[] = [];
  const inferenceTimes: number[] = [];
  const gateEvents: Array<"ACTIVE" | "QUEUED" | "REJECTED" | "RELEASED"> = [];
  const observer: AdamCoddV2RuntimeObserver = {
    onModelSessionReady: (value) => sessionTimes.push(value),
    onPreprocessingComplete: (value) => preprocessTimes.push(value),
    onInferenceComplete: (value) => inferenceTimes.push(value),
    onInferenceGate: (event) => gateEvents.push(event),
  };
  const service = new AdamCoddV2ImageSafetyService({
    modelPath: MODEL_PATH,
    observer,
    sessionTuning: experiment.onnx,
    inferenceCapacity: { maxConcurrent: experiment.inferenceConcurrency, maxQueued: 8 },
  });
  const snapshots: Array<Readonly<{ stage: string; memory: Memory }>> = [{ stage: "process-start", memory: memory() }];
  const periodic: Memory[] = [];
  let overLimit = false;
  const monitor = setInterval(() => {
    const next = memory();
    periodic.push(next);
    if (next.rssMiB > SAFE_RSS_LIMIT_MIB) overLimit = true;
  }, 50);
  monitor.unref();
  const assertMemorySafe = () => { if (overLimit) throw new Error(`SAFE_RSS_LIMIT_EXCEEDED_${SAFE_RSS_LIMIT_MIB}_MIB`); };
  const results: Array<Readonly<{ candidateId: string; decision: string; expectedDecision: Decision; decisionMatch: boolean; totalMs: number }>> = [];
  const classify = async (entry: Sample) => {
    const startedAt = performance.now();
    const result = await service.classify(entry.bytes);
    const row = { candidateId: entry.candidateId, decision: result.decision, expectedDecision: entry.expectedDecision, decisionMatch: result.decision === entry.expectedDecision, totalMs: round(performance.now() - startedAt) };
    results.push(row);
    return row;
  };
  const cpuBefore = process.cpuUsage();
  try {
    const cold = await classify(activeSample[0]!);
    assertMemorySafe();
    snapshots.push({ stage: "after-first-inference", memory: memory() });
    for (const entry of activeSample) await classify(entry);
    assertMemorySafe();
    snapshots.push({ stage: "after-repeated-inference", memory: memory() });
    const pressureStart = results.length;
    const gateEventStart = gateEvents.length;
    const requested = pressure === "NORMAL"
      ? (smoke ? 0 : 3)
      : pressure === "QUEUE"
        ? experiment.inferenceConcurrency + 2
        : experiment.inferenceConcurrency + 8 + 2;
    const batchStartedAt = performance.now();
    const concurrentResults = requested === 0 ? [] : await Promise.all(Array.from({ length: requested }, () => classify(activeSample[0]!)));
    const batchDurationMs = round(performance.now() - batchStartedAt);
    const pressureResults = results.slice(pressureStart);
    const pressureGateEvents = gateEvents.slice(gateEventStart);
    if (pressure === "QUEUE" && pressureResults.some((result) => result.decision === "UNAVAILABLE")) throw new Error("QUEUE_WORKLOAD_REJECTED_A_REQUEST");
    if (pressure === "SATURATION" && !pressureResults.some((result) => result.decision === "UNAVAILABLE")) throw new Error("SATURATION_WORKLOAD_DID_NOT_REJECT_A_REQUEST");
    let recovery: Readonly<{ decision: string; expectedDecision: Decision; decisionMatch: boolean; totalMs: number }> | null = null;
    if (pressure === "SATURATION") {
      const recoveryStart = performance.now();
      const recoveryResult = await service.classify(activeSample[1]!.bytes);
      recovery = { decision: recoveryResult.decision, expectedDecision: activeSample[1]!.expectedDecision, decisionMatch: recoveryResult.decision === activeSample[1]!.expectedDecision, totalMs: round(performance.now() - recoveryStart) };
      if (recovery.decision === "UNAVAILABLE" || !recovery.decisionMatch) throw new Error("SATURATION_RECOVERY_FAILED");
    }
    assertMemorySafe();
    snapshots.push({ stage: "after-bounded-concurrency", memory: memory() });
    await sleep(smoke ? 250 : 5_000);
    snapshots.push({ stage: smoke ? "after-idle-250ms" : "after-idle-5s", memory: memory() });
    if (!smoke) {
      await sleep(10_000);
      snapshots.push({ stage: "after-idle-15s", memory: memory() });
    }
    clearInterval(monitor);
    const observed = [...snapshots.map((snapshot) => snapshot.memory), ...periodic];
    const cpu = process.cpuUsage(cpuBefore);
    const report = {
      schemaVersion: "STHN_I3B_5C_V2_MEMORY_EXPERIMENT_V1",
      status: "COMPLETED",
      worker: { pid: process.pid, freshProcess: true },
      configuration: { id: experiment.id, onnx: { executionProvider: "cpu", enableCpuMemArena: false, enableMemPattern: false, ...experiment.onnx }, sharp: { cache: experiment.sharpCache, concurrency: experiment.sharpConcurrency, applied: sharpSettings }, inferenceCapacity: { maxConcurrent: experiment.inferenceConcurrency, maxQueued: 8 }, safeRssLimitMiB: SAFE_RSS_LIMIT_MIB },
      artifact: { path: "models/adamcodd-v2/model_int8.onnx", bytes: artifact.length, sha256: ADAMCODD_V2_RUNTIME_AUTHORITY.artifactSha256 },
      inputIdentity: activeSample.map((entry) => ({ candidateId: entry.candidateId, sha256: entry.sha256 })),
      results,
      referenceAgreement: results.filter((result) => result.decision !== "UNAVAILABLE").every((result) => result.decisionMatch)
        && (pressure === "SATURATION" ? results.some((result) => result.decision === "UNAVAILABLE") : results.every((result) => result.decision !== "UNAVAILABLE"))
        && (recovery?.decision !== "UNAVAILABLE") && (recovery?.decisionMatch ?? true),
      counts: { pass: results.filter((result) => result.decision === "PASS").length, block: results.filter((result) => result.decision === "BLOCK").length, unavailable: results.filter((result) => result.decision === "UNAVAILABLE").length, concurrentRequested: concurrentResults.length },
      pressure: {
        mode: pressure,
        requested,
        batchDurationMs,
        throughputRequestsPerSecond: requested === 0 ? null : round(requested / (batchDurationMs / 1_000)),
        outcomes: {
          active: pressureGateEvents.filter((event) => event === "ACTIVE").length,
          queued: pressureGateEvents.filter((event) => event === "QUEUED").length,
          rejected: pressureGateEvents.filter((event) => event === "REJECTED").length,
          released: pressureGateEvents.filter((event) => event === "RELEASED").length,
          unavailable: pressureResults.filter((result) => result.decision === "UNAVAILABLE").length,
        },
        requestLatency: statistics(pressureResults.map((result) => result.totalMs)),
        recovery,
      },
      measurements: { coldClassification: cold.totalMs, modelSessionInitialization: statistics(sessionTimes), preprocessing: statistics(preprocessTimes), onnxInference: statistics(inferenceTimes), warmClassification: statistics(results.slice(1).map((result) => result.totalMs)), cpu: { userMs: round(cpu.user / 1000), systemMs: round(cpu.system / 1000) } },
      memorySnapshots: snapshots,
      memory: { periodicSampleCount: periodic.length, peakRssMiB: Math.max(...observed.map((value) => value.rssMiB)), peakExternalMiB: Math.max(...observed.map((value) => value.externalMiB)), peakArrayBuffersMiB: Math.max(...observed.map((value) => value.arrayBuffersMiB)) },
      conclusion: "EXPERIMENTAL_LOCAL_MEASUREMENT_NOT_PRODUCTION_CONFIGURATION",
    };
    await atomicJson(path.join(outputDirectory, `${experiment.id}.json`), report);
  } catch (error) {
    clearInterval(monitor);
    await atomicJson(path.join(outputDirectory, `${experiment.id}.json`), { schemaVersion: "STHN_I3B_5C_V2_MEMORY_EXPERIMENT_V1", status: "FAILED", worker: { pid: process.pid, freshProcess: true }, configuration: experiment, error: error instanceof Error ? error.message : "Unknown failure", memorySnapshots: snapshots, conclusion: "EXPERIMENT_STOPPED_WITHOUT_PRODUCTION_CHANGE" });
    throw error;
  }
};

const executeChild = async (experiment: Experiment, smoke: boolean, outputDirectory: string): Promise<void> => new Promise((resolve) => {
  let timedOut = false;
  const child = spawn(process.execPath, ["-r", "ts-node/register", SCRIPT, "--worker", "v2", "--experiment", experiment.id, ...(smoke ? ["--smoke"] : []), "--output-dir", outputDirectory], { cwd: ROOT, stdio: "inherit", windowsHide: true });
  const timeout = setTimeout(() => { timedOut = true; child.kill(); }, 180_000);
  child.once("exit", async (code) => {
    clearTimeout(timeout);
    if (timedOut) await atomicJson(path.join(outputDirectory, `${experiment.id}.json`), { schemaVersion: "STHN_I3B_5C_V2_MEMORY_EXPERIMENT_V1", status: "TIMED_OUT", worker: { freshProcess: true }, configuration: experiment, conclusion: "EXPERIMENT_STOPPED_AFTER_180_SECONDS" });
    if (code !== 0 && !timedOut) console.error(`Experiment ${experiment.id} exited with ${code ?? "no exit code"}`);
    resolve();
  });
  child.once("error", async (error) => { clearTimeout(timeout); await atomicJson(path.join(outputDirectory, `${experiment.id}.json`), { schemaVersion: "STHN_I3B_5C_V2_MEMORY_EXPERIMENT_V1", status: "FAILED_TO_START", configuration: experiment, error: error.message }); resolve(); });
});

const executeParent = async (smoke: boolean, outputDirectory: string): Promise<void> => {
  const scheduled = smoke ? [EXPERIMENTS[0]!] : EXPERIMENTS;
  for (const experiment of scheduled) await executeChild(experiment, smoke, outputDirectory);
  const reports = await Promise.all(scheduled.map((experiment) => readJson<Record<string, unknown>>(path.join(outputDirectory, `${experiment.id}.json`))));
  const summary = { schemaVersion: "STHN_I3B_5C_V2_MEMORY_EXPERIMENT_SUMMARY_V1", generatedAt: new Date().toISOString(), workload: { smoke, experimentsSequential: true, freshNodeProcessPerExperiment: true, noAdmissionRoute: true, noCloudinary: true, noMongoDb: true }, experiments: reports, rankingMethod: "VALID_FROZEN_DECISION_AGREEMENT_THEN_SAMPLED_PEAK_RSS_THEN_WARM_MEDIAN_LATENCY", conclusion: "EXPERIMENTAL_RESULTS_REQUIRE_REVIEW_BEFORE_ANY_PRODUCTION_CONFIGURATION_CHANGE" };
  await atomicJson(path.join(outputDirectory, "comparison-report.json"), summary);
  await writeMarkdown(outputDirectory, reports);
  console.info(JSON.stringify({ status: summary.conclusion, outputDirectory, experiments: reports.length, smoke }, null, 2));
};

void (async () => {
  const options = parse(process.argv.slice(2));
  if (options.worker) await runWorker(findExperiment(options.experiment!), options.smoke, options.outputDirectory, options.pressure);
  else await executeParent(options.smoke, options.outputDirectory);
})().catch((error: unknown) => {
  console.error(`AdamCodd V2 memory experiments failed: ${error instanceof Error ? error.message : "Unknown failure"}`);
  process.exitCode = 1;
});
