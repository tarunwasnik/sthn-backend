import { spawn } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

type WorkerReport = Readonly<{
  status?: string;
  referenceAgreement?: boolean;
  configuration?: Readonly<{ id?: string }>;
  measurements?: Readonly<{
    coldClassification?: number;
    warmClassification?: Readonly<{ medianMs?: number | null }>;
    preprocessing?: Readonly<{ medianMs?: number | null }>;
    onnxInference?: Readonly<{ medianMs?: number | null }>;
    cpu?: Readonly<{ userMs?: number; systemMs?: number }>;
  }>;
  memory?: Readonly<{ peakRssMiB?: number }>;
  memorySnapshots?: readonly Readonly<{ stage?: string; memory?: Readonly<{ rssMiB?: number }> }>[];
}>;

type I3B5CBaseline = Readonly<{ experiments?: readonly WorkerReport[] }>;
type PlannedRun = Readonly<{ configurationId: string; trial: number }>;

const ROOT = process.cwd();
const COMPILED_WORKER = path.join(ROOT, "dist", "scripts", "runAdamCoddV2MemoryExperiments.js");
const I3B5C_REPORT = path.join(ROOT, "evaluation-output", "image-moderation", "i3b-5c-v2-memory-experiments", "full", "comparison-report.json");
const DEFAULT_OUTPUT_ROOT = path.join(ROOT, "evaluation-output", "image-moderation", "i3b-5d-v2-memory-validation");
const CHILD_TIMEOUT_MS = 180_000;

const I3B5C_IDS = [
  "baseline-defaults",
  "onnx-threads-1-1",
  "onnx-threads-2-1",
  "sharp-cache-disabled",
  "sharp-concurrency-1",
  "sharp-concurrency-2",
  "inference-capacity-1",
] as const;

const argument = (argv: readonly string[], name: string): string | undefined => {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
};

const parse = (argv: readonly string[]) => {
  const smoke = argv.includes("--smoke");
  const outputArgument = argument(argv, "--output-dir");
  if (outputArgument === undefined && argv.includes("--output-dir")) throw new Error("--output-dir requires a value");
  const outputDirectory = outputArgument
    ? path.resolve(ROOT, outputArgument)
    : path.join(DEFAULT_OUTPUT_ROOT, `run-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  return { smoke, outputDirectory };
};

const readJson = async <T>(file: string): Promise<T> => JSON.parse(await readFile(file, "utf8")) as T;

const atomicJson = async (file: string, value: unknown): Promise<void> => {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, file);
};

const median = (values: readonly number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return Number(sorted[Math.floor((sorted.length - 1) / 2)]!.toFixed(3));
};

const range = (values: readonly number[]) => values.length === 0
  ? { minimum: null, median: null, maximum: null }
  : {
    minimum: Number(Math.min(...values).toFixed(3)),
    median: median(values),
    maximum: Number(Math.max(...values).toFixed(3)),
  };

const requireI3B5CBaseline = async (): Promise<Readonly<{ source: string; experiments: readonly WorkerReport[] }>> => {
  const baseline = await readJson<I3B5CBaseline>(I3B5C_REPORT);
  const experiments = baseline.experiments ?? [];
  if (experiments.length !== I3B5C_IDS.length) throw new Error("I3B-5C baseline does not contain seven experiment reports");
  for (const id of I3B5C_IDS) {
    const report = experiments.find((candidate) => candidate.configuration?.id === id);
    if (!report || report.status !== "COMPLETED" || report.referenceAgreement !== true) throw new Error(`I3B-5C baseline is incomplete for ${id}`);
  }
  return { source: I3B5C_REPORT, experiments };
};

const plan = (smoke: boolean): readonly PlannedRun[] => {
  if (smoke) {
    return [
      { configurationId: "baseline-defaults", trial: 1 },
      { configurationId: "sharp-cache-disabled", trial: 1 },
    ];
  }
  return [
    ...[1, 2, 3].map((trial) => ({ configurationId: "baseline-defaults", trial })),
    ...[1, 2, 3].map((trial) => ({ configurationId: "sharp-cache-disabled", trial })),
    { configurationId: "sharp-cache-disabled-onnx-threads-1-1", trial: 1 },
    { configurationId: "sharp-cache-disabled-onnx-threads-2-1", trial: 1 },
    { configurationId: "sharp-cache-disabled-inference-capacity-1", trial: 1 },
  ];
};

const runWorker = async (planned: PlannedRun, smoke: boolean, outputDirectory: string): Promise<Readonly<{ planned: PlannedRun; exitCode: number | null; timedOut: boolean; report?: WorkerReport; reportPath: string }>> => {
  const runDirectory = path.join(outputDirectory, "runs", planned.configurationId, `trial-${String(planned.trial).padStart(2, "0")}`);
  const reportPath = path.join(runDirectory, `${planned.configurationId}.json`);
  const args = [COMPILED_WORKER, "--worker", "v2", "--experiment", planned.configurationId, ...(smoke ? ["--smoke"] : []), "--output-dir", runDirectory];
  const outcome = await new Promise<Readonly<{ exitCode: number | null; timedOut: boolean }>>((resolve) => {
    let timedOut = false;
    const child = spawn(process.execPath, args, { cwd: ROOT, stdio: "inherit", windowsHide: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, CHILD_TIMEOUT_MS);
    child.once("exit", (exitCode) => {
      clearTimeout(timeout);
      resolve({ exitCode, timedOut });
    });
    child.once("error", () => {
      clearTimeout(timeout);
      resolve({ exitCode: null, timedOut });
    });
  });
  let report: WorkerReport | undefined;
  try {
    report = await readJson<WorkerReport>(reportPath);
  } catch {
    // The parent report records the absent worker report as an incomplete run.
  }
  return { planned, ...outcome, report, reportPath };
};

const summarize = (runs: readonly Awaited<ReturnType<typeof runWorker>>[]) => {
  const valid = runs.filter((run) => run.exitCode === 0 && !run.timedOut && run.report?.status === "COMPLETED" && run.report.referenceAgreement === true);
  const numberValues = (select: (report: WorkerReport) => number | null | undefined) => valid.flatMap((run) => {
    const value = run.report ? select(run.report) : null;
    return typeof value === "number" && Number.isFinite(value) ? [value] : [];
  });
  const retainedAt15Seconds = numberValues((report) => report.memorySnapshots?.find((snapshot) => snapshot.stage === "after-idle-15s")?.memory?.rssMiB);
  return {
    scheduled: runs.length,
    valid: valid.length,
    failures: runs.length - valid.length,
    decisionAgreement: valid.length === runs.length,
    sampledPeakRssMiB: range(numberValues((report) => report.memory?.peakRssMiB)),
    retainedRssAfter15SecondsMiB: range(retainedAt15Seconds),
    coldClassificationMs: range(numberValues((report) => report.measurements?.coldClassification)),
    warmClassificationMedianMs: range(numberValues((report) => report.measurements?.warmClassification?.medianMs)),
    preprocessingMedianMs: range(numberValues((report) => report.measurements?.preprocessing?.medianMs)),
    onnxInferenceMedianMs: range(numberValues((report) => report.measurements?.onnxInference?.medianMs)),
    cpuUserMs: range(numberValues((report) => report.measurements?.cpu?.userMs)),
    cpuSystemMs: range(numberValues((report) => report.measurements?.cpu?.systemMs)),
  };
};

const markdown = (summary: Readonly<Record<string, unknown>>): string => {
  const aggregates = summary.aggregates as Readonly<Record<string, ReturnType<typeof summarize>>>;
  const rows = Object.entries(aggregates).map(([id, value]) => `| ${id} | ${value.valid}/${value.scheduled} | ${value.sampledPeakRssMiB.median ?? "n/a"} | ${value.retainedRssAfter15SecondsMiB.median ?? "n/a"} | ${value.warmClassificationMedianMs.median ?? "n/a"} |`);
  return [
    "# AdamCodd V2 memory optimization validation",
    "",
    "Fresh compiled-JavaScript worker processes only. This is local Windows qualification evidence, not Render/Linux evidence and not a production configuration decision.",
    "",
    "| Configuration | Valid/scheduled | Median sampled peak RSS MiB | Median retained RSS after 15s MiB | Median warm latency ms |",
    "|---|---:|---:|---:|---:|",
    ...rows,
    "",
    "Sharp cache settings are process-global only within each disposable worker. No production setting was changed.",
    "",
  ].join("\n");
};

void (async () => {
  const options = parse(process.argv.slice(2));
  await readFile(COMPILED_WORKER);
  const baseline = await requireI3B5CBaseline();
  const scheduled = plan(options.smoke);
  const completed: Array<Awaited<ReturnType<typeof runWorker>>> = [];
  for (const planned of scheduled) completed.push(await runWorker(planned, options.smoke, options.outputDirectory));
  const grouped = new Map<string, Awaited<ReturnType<typeof runWorker>>[]>();
  for (const run of completed) grouped.set(run.planned.configurationId, [...(grouped.get(run.planned.configurationId) ?? []), run]);
  const aggregates = Object.fromEntries([...grouped.entries()].map(([id, runs]) => [id, summarize(runs)]));
  const allValid = Object.values(aggregates).every((aggregate) => aggregate.valid === aggregate.scheduled);
  const report = {
    schemaVersion: "STHN_I3B_5D_V2_MEMORY_VALIDATION_V1",
    generatedAt: new Date().toISOString(),
    status: allValid ? "COMPLETED" : "INCOMPLETE",
    runtime: { parent: "compiled-javascript", worker: "compiled-javascript", executable: process.execPath, node: process.version, freshSequentialWorkers: true, childTimeoutMs: CHILD_TIMEOUT_MS },
    baseline: { source: baseline.source, verifiedSevenConfigurations: I3B5C_IDS, experiments: baseline.experiments },
    workload: { smoke: options.smoke, fourFixedHashVerifiedCollectionCImages: !options.smoke, noCloudinary: true, noMongoDb: true, noAdmissionRoute: true, safeRssGuardMiB: 1536 },
    runs: completed,
    aggregates,
    conclusion: allValid
      ? "EXPERIMENTAL_LOCAL_WINDOWS_RESULTS_REQUIRE_RENDER_OR_LINUX_QUALIFICATION_BEFORE_ANY_PRODUCTION_SETTING"
      : "INCOMPLETE_VALIDATION_NO_PRODUCTION_SETTING_RECOMMENDATION",
  };
  await atomicJson(path.join(options.outputDirectory, "validation-report.json"), report);
  await writeFile(path.join(options.outputDirectory, "validation-report.md"), markdown(report), "utf8");
  console.info(JSON.stringify({ status: report.status, outputDirectory: options.outputDirectory, runs: completed.length, smoke: options.smoke }, null, 2));
  if (!allValid) process.exitCode = 1;
})().catch((error: unknown) => {
  console.error(`AdamCodd V2 memory validation failed: ${error instanceof Error ? error.message : "Unknown failure"}`);
  process.exitCode = 1;
});
