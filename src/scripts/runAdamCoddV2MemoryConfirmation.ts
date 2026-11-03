import { spawn } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import path from "node:path";

type Pressure = "NORMAL" | "QUEUE" | "SATURATION";
type PlannedRun = Readonly<{ configurationId: string; pressure: Pressure; trial: number }>;
type WorkerReport = Readonly<{
  status?: string;
  referenceAgreement?: boolean;
  configuration?: Readonly<{ id?: string; inferenceCapacity?: Readonly<{ maxConcurrent?: number; maxQueued?: number }> }>;
  counts?: Readonly<{ unavailable?: number }>;
  memory?: Readonly<{ peakRssMiB?: number; peakExternalMiB?: number; peakArrayBuffersMiB?: number }>;
  memorySnapshots?: readonly Readonly<{ stage?: string; memory?: Readonly<{ rssMiB?: number }> }>[];
  measurements?: Readonly<{
    coldClassification?: number;
    warmClassification?: Readonly<{ medianMs?: number | null }>;
    preprocessing?: Readonly<{ medianMs?: number | null }>;
    onnxInference?: Readonly<{ medianMs?: number | null }>;
    cpu?: Readonly<{ userMs?: number; systemMs?: number }>;
  }>;
  pressure?: Readonly<{
    mode?: Pressure;
    requested?: number;
    batchDurationMs?: number;
    throughputRequestsPerSecond?: number | null;
    outcomes?: Readonly<{ active?: number; queued?: number; rejected?: number; released?: number; unavailable?: number }>;
    requestLatency?: Readonly<{ medianMs?: number | null; p95Ms?: number | null; maxMs?: number | null }>;
    recovery?: Readonly<{ decision?: string; decisionMatch?: boolean }> | null;
  }>;
}>;
type I3B5DReport = Readonly<{ status?: string; aggregates?: Record<string, unknown> }>;
type CompletedRun = Readonly<{ planned: PlannedRun; exitCode: number | null; timedOut: boolean; workerWallClockMs: number; report?: WorkerReport; reportPath: string }>;

const ROOT = process.cwd();
const COMPILED_WORKER = path.join(ROOT, "dist", "scripts", "runAdamCoddV2MemoryExperiments.js");
const I3B5D_REPORT = path.join(ROOT, "evaluation-output", "image-moderation", "i3b-5d-v2-memory-validation", "full", "validation-report.json");
const DEFAULT_OUTPUT_ROOT = path.join(ROOT, "evaluation-output", "image-moderation", "i3b-5e-memory-confirmation");
const CHILD_TIMEOUT_MS = 180_000;

const argument = (argv: readonly string[], name: string): string | undefined => {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
};

const options = (argv: readonly string[]) => {
  const smoke = argv.includes("--smoke");
  const output = argument(argv, "--output-dir");
  if (output === undefined && argv.includes("--output-dir")) throw new Error("--output-dir requires a value");
  return {
    smoke,
    outputDirectory: output ? path.resolve(ROOT, output) : path.join(DEFAULT_OUTPUT_ROOT, `run-${new Date().toISOString().replace(/[:.]/g, "-")}`),
  };
};

const readJson = async <T>(file: string): Promise<T> => JSON.parse(await readFile(file, "utf8")) as T;
const atomicJson = async (file: string, value: unknown): Promise<void> => {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, file);
};
const round = (value: number) => Number(value.toFixed(3));
const median = (values: readonly number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return round(sorted[Math.floor((sorted.length - 1) / 2)]!);
};
const range = (values: readonly number[]) => values.length === 0
  ? { minimum: null, median: null, maximum: null }
  : { minimum: round(Math.min(...values)), median: median(values), maximum: round(Math.max(...values)) };

const plan = (smoke: boolean): readonly PlannedRun[] => {
  if (smoke) return [
    { configurationId: "baseline-defaults", pressure: "NORMAL", trial: 1 },
    { configurationId: "sharp-cache-disabled", pressure: "SATURATION", trial: 1 },
  ];
  const repeated = (configurationId: string) => [1, 2, 3, 4, 5].map((trial) => ({ configurationId, pressure: "NORMAL" as const, trial }));
  return [
    ...repeated("baseline-defaults"),
    ...repeated("sharp-cache-disabled"),
    ...repeated("sharp-cache-disabled-inference-capacity-1"),
    { configurationId: "sharp-cache-disabled", pressure: "QUEUE", trial: 1 },
    { configurationId: "sharp-cache-disabled", pressure: "SATURATION", trial: 1 },
    { configurationId: "sharp-cache-disabled-inference-capacity-1", pressure: "QUEUE", trial: 1 },
    { configurationId: "sharp-cache-disabled-inference-capacity-1", pressure: "SATURATION", trial: 1 },
  ];
};

const run = async (planned: PlannedRun, smoke: boolean, outputDirectory: string): Promise<CompletedRun> => {
  const directory = path.join(outputDirectory, "runs", planned.configurationId, planned.pressure.toLowerCase(), `trial-${String(planned.trial).padStart(2, "0")}`);
  const reportPath = path.join(directory, `${planned.configurationId}.json`);
  const args = [COMPILED_WORKER, "--worker", "v2", "--experiment", planned.configurationId, "--pressure", planned.pressure, ...(smoke ? ["--smoke"] : []), "--output-dir", directory];
  const outcome = await new Promise<Readonly<{ exitCode: number | null; timedOut: boolean; workerWallClockMs: number }>>((resolve) => {
    const startedAt = performance.now();
    let timedOut = false;
    const child = spawn(process.execPath, args, { cwd: ROOT, stdio: "inherit", windowsHide: true });
    const timeout = setTimeout(() => { timedOut = true; child.kill(); }, CHILD_TIMEOUT_MS);
    child.once("exit", (exitCode) => {
      clearTimeout(timeout);
      resolve({ exitCode, timedOut, workerWallClockMs: round(performance.now() - startedAt) });
    });
    child.once("error", () => {
      clearTimeout(timeout);
      resolve({ exitCode: null, timedOut, workerWallClockMs: round(performance.now() - startedAt) });
    });
  });
  let report: WorkerReport | undefined;
  try { report = await readJson<WorkerReport>(reportPath); } catch { /* recorded as incomplete below */ }
  return { planned, ...outcome, report, reportPath };
};

const valid = (run: CompletedRun) => run.exitCode === 0 && !run.timedOut && run.report?.status === "COMPLETED" && run.report.referenceAgreement === true;
const values = (runs: readonly CompletedRun[], selector: (report: WorkerReport) => number | null | undefined) => runs.flatMap((run) => {
  const value = run.report ? selector(run.report) : null;
  return typeof value === "number" && Number.isFinite(value) ? [value] : [];
});
const summarize = (runs: readonly CompletedRun[]) => {
  const successful = runs.filter(valid);
  return {
    scheduled: runs.length,
    valid: successful.length,
    failures: runs.length - successful.length,
    decisionAgreement: successful.length === runs.length,
    sampledPeakRssMiB: range(values(successful, (report) => report.memory?.peakRssMiB)),
    retainedRssAfter5SecondsMiB: range(values(successful, (report) => report.memorySnapshots?.find((snapshot) => snapshot.stage === "after-idle-5s")?.memory?.rssMiB)),
    retainedRssAfter15SecondsMiB: range(values(successful, (report) => report.memorySnapshots?.find((snapshot) => snapshot.stage === "after-idle-15s")?.memory?.rssMiB)),
    peakExternalMiB: range(values(successful, (report) => report.memory?.peakExternalMiB)),
    peakArrayBuffersMiB: range(values(successful, (report) => report.memory?.peakArrayBuffersMiB)),
    coldClassificationMs: range(values(successful, (report) => report.measurements?.coldClassification)),
    warmClassificationMedianMs: range(values(successful, (report) => report.measurements?.warmClassification?.medianMs)),
    preprocessingMedianMs: range(values(successful, (report) => report.measurements?.preprocessing?.medianMs)),
    onnxInferenceMedianMs: range(values(successful, (report) => report.measurements?.onnxInference?.medianMs)),
    cpuUserMs: range(values(successful, (report) => report.measurements?.cpu?.userMs)),
    cpuSystemMs: range(values(successful, (report) => report.measurements?.cpu?.systemMs)),
    workerWallClockMs: range(successful.map((run) => run.workerWallClockMs)),
    pressure: {
      requested: range(values(successful, (report) => report.pressure?.requested)),
      batchDurationMs: range(values(successful, (report) => report.pressure?.batchDurationMs)),
      throughputRequestsPerSecond: range(values(successful, (report) => report.pressure?.throughputRequestsPerSecond)),
      queued: range(values(successful, (report) => report.pressure?.outcomes?.queued)),
      rejected: range(values(successful, (report) => report.pressure?.outcomes?.rejected)),
      unavailable: range(values(successful, (report) => report.pressure?.outcomes?.unavailable)),
      requestLatencyMedianMs: range(values(successful, (report) => report.pressure?.requestLatency?.medianMs)),
      requestLatencyP95Ms: range(values(successful, (report) => report.pressure?.requestLatency?.p95Ms)),
      recoverySucceeded: successful.every((run) => run.planned.pressure !== "SATURATION" || run.report?.pressure?.recovery?.decisionMatch === true),
    },
  };
};

const sharpSafetyAnalysis = {
  currentGlobalConfiguration: "No production sharp.cache(...) or sharp.concurrency(...) call was found. The only cache mutation is the disposable I3B qualification worker.",
  runtimeConsumers: [
    "src/services/imageModeration/imageTemporaryUpload.service.ts (validated upload preparation)",
    "src/services/imageModeration/imageModerationProcessingDerivative.service.ts (V1 derivative generation)",
    "src/services/imageModeration/adamCoddImageSafety.service.ts (V1 preprocessing)",
    "src/services/imageModeration/adamCoddV2Preprocessing.service.ts (V2 original-byte preprocessing)",
    "src/services/profile/profileVerificationFaceEmbedding.service.ts and profileVerificationYuNetRunner.ts (Face Verification media processing)",
  ],
  options: [
    "Process-wide disabled cache: may reduce RSS, but changes cache behavior for every listed Sharp consumer and needs whole-service regression and Linux evidence.",
    "Keep shared defaults with isolation: a dedicated image worker/process could isolate Sharp configuration, but no such production architecture is introduced in this stage.",
    "Retain current defaults: preserves present cross-feature behavior until a production-wide memory/performance decision is justified.",
  ],
};

const markdown = (report: Readonly<Record<string, unknown>>) => {
  const aggregates = report.aggregates as Record<string, ReturnType<typeof summarize>>;
  const rows = Object.entries(aggregates).map(([id, value]) => `| ${id} | ${value.valid}/${value.scheduled} | ${value.sampledPeakRssMiB.median ?? "n/a"} | ${value.retainedRssAfter15SecondsMiB.median ?? "n/a"} | ${value.warmClassificationMedianMs.median ?? "n/a"} |`);
  return [
    "# AdamCodd V2 memory optimization confirmation",
    "",
    "Compiled JavaScript, fresh sequential Node workers. The worker report measures classification lifecycle; parent wall-clock duration additionally covers spawned-worker startup through exit. This remains Windows evidence, not Render/Linux qualification.",
    "",
    "| Configuration/workload | Valid/scheduled | Peak RSS median MiB | RSS after 15s median MiB | Warm median ms |",
    "|---|---:|---:|---:|---:|",
    ...rows,
    "",
    "Sharp cache changes remain inside disposable workers. No production Sharp, V1/V2 selector, capacity, ONNX, model, or admission setting changed.",
    "",
  ].join("\n");
};

void (async () => {
  const parsed = options(process.argv.slice(2));
  await readFile(COMPILED_WORKER);
  const prior = await readJson<I3B5DReport>(I3B5D_REPORT);
  if (prior.status !== "COMPLETED" || !prior.aggregates) throw new Error("I3B-5D compiled validation evidence is incomplete");
  const scheduled = plan(parsed.smoke);
  const completed: CompletedRun[] = [];
  for (const planned of scheduled) completed.push(await run(planned, parsed.smoke, parsed.outputDirectory));
  const grouped = new Map<string, CompletedRun[]>();
  for (const item of completed) {
    const key = `${item.planned.configurationId}:${item.planned.pressure}`;
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }
  const aggregates = Object.fromEntries([...grouped.entries()].map(([key, items]) => [key, summarize(items)]));
  const complete = Object.values(aggregates).every((aggregate) => aggregate.valid === aggregate.scheduled);
  const report = {
    schemaVersion: "STHN_I3B_5E_V2_MEMORY_CONFIRMATION_V1",
    generatedAt: new Date().toISOString(),
    status: complete ? "COMPLETED" : "INCOMPLETE",
    commands: {
      compiledWorker: `node ${path.relative(ROOT, COMPILED_WORKER)} --worker v2 --experiment <id> --pressure <NORMAL|QUEUE|SATURATION> --output-dir <directory>`,
      fullConfirmation: "npm run build; node dist/scripts/runAdamCoddV2MemoryConfirmation.js --output-dir evaluation-output/image-moderation/i3b-5e-memory-confirmation/full",
    },
    runtime: { parent: "compiled-javascript", worker: "compiled-javascript", node: process.version, freshSequentialWorkers: true, childTimeoutMs: CHILD_TIMEOUT_MS, workerRssGuardMiB: 1536 },
    baseline: { i3b5dReport: I3B5D_REPORT, verified: true },
    workload: { smoke: parsed.smoke, frozenFourImageWorkload: !parsed.smoke, model: "STHN_ADAMCODD_V2_INT8", preprocessing: "STHN_ADAMCODD_V2_ORIGINAL_SHARP_LINEAR_V1", threshold: 0.3362914399272772 },
    runs: completed,
    aggregates,
    sharpGlobalSafetyAnalysis: sharpSafetyAnalysis,
    limitations: [
      "Sampled RSS is not a kernel-enforced maximum and does not replace container memory telemetry.",
      "The measurement host is Windows; Render/Linux allocator, libvips, ONNX Runtime, and cgroup behavior remain unmeasured.",
      "No process-wide Sharp configuration change is safe to infer from disposable-worker evidence alone.",
    ],
    conclusion: complete
      ? "EXPERIMENTAL_CONFIRMATION_COMPLETE_REQUIRES_LINUX_OR_RENDER_QUALIFICATION_BEFORE_ANY_PRODUCTION_CONFIGURATION"
      : "INCOMPLETE_CONFIRMATION_NO_PRODUCTION_CONFIGURATION_RECOMMENDATION",
  };
  await atomicJson(path.join(parsed.outputDirectory, "confirmation-report.json"), report);
  await writeFile(path.join(parsed.outputDirectory, "confirmation-report.md"), markdown(report), "utf8");
  console.info(JSON.stringify({ status: report.status, outputDirectory: parsed.outputDirectory, runs: completed.length, smoke: parsed.smoke }, null, 2));
  if (!complete) process.exitCode = 1;
})().catch((error: unknown) => {
  console.error(`AdamCodd V2 memory confirmation failed: ${error instanceof Error ? error.message : "Unknown failure"}`);
  process.exitCode = 1;
});
