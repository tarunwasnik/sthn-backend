import { createHash } from "node:crypto";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { DetectorEvaluationResult, ImageModerationEvaluationFixture, ImageModerationSurface, ImagePolicyCategory } from "./imageModerationEvaluation.types";
import { Qwen3VlEvaluationImagePreparation, Qwen3VlEvaluationRecord, Qwen3VlOfflineEvaluationAdapter } from "./qwen3VlOfflineEvaluation";
import { QWEN3_VL_PILOT_20, QWEN3_VL_PILOT_20_REQUIREMENTS, QWEN3_VL_PILOT_20_STRATUM_COUNTS, Qwen3VlPilotSelection, Qwen3VlPilotStratum } from "./qwen3VlPilot20.manifest";

type InventoryCandidate = Readonly<{ id: string; state: string; localAsset: string; sha256: string }>;
type ReviewedCandidate = Readonly<{ candidateId: string; state: string; expectedDecision: "PASS" | "BLOCK"; categories: readonly ImagePolicyCategory[]; surfaces: readonly ImageModerationSurface[]; contextTags: readonly string[]; coverageClasses: readonly string[] }>;
type AdamCoddResult = Readonly<{ candidateId: string; evaluationDecision: "PASS" | "BLOCK" }>;
type PilotAdapter = Omit<Pick<Qwen3VlOfflineEvaluationAdapter, "evaluate" | "getEvaluationRecords" | "getCandidateMetadata">, "getCandidateMetadata"> & Readonly<{ getCandidateMetadata(): unknown }>;

export interface Qwen3VlPilotInput {
  readonly selection: Qwen3VlPilotSelection;
  readonly sourceSha256: string;
  readonly bytes: Buffer;
}

export interface Qwen3VlPilotInferenceRow {
  readonly fixtureId: string;
  readonly stratum: Qwen3VlPilotStratum;
  readonly sourceSha256: string;
  readonly qwenStatus: "PASS" | "BLOCK" | "UNCERTAIN" | "ERROR" | "UNAVAILABLE";
  readonly qwenCategories: readonly ImagePolicyCategory[];
  readonly qwenRationale: string | null;
  readonly errorCode: string | null;
  readonly schemaValid: boolean;
  readonly inferenceLatencyMs: number | null;
  readonly processRssBytes: number | null;
  readonly freeSystemMemoryBytes: number | null;
  readonly imagePreparation: Qwen3VlEvaluationImagePreparation | null;
}

export interface Qwen3VlPilotReportRow extends Qwen3VlPilotInferenceRow {
  readonly contextTags: readonly string[];
  readonly humanDecision: "PASS" | "BLOCK";
  readonly humanCategories: readonly ImagePolicyCategory[];
  readonly adamCoddDecision: "PASS" | "BLOCK" | null;
  readonly assessment: "CORRECT" | "INCORRECT" | "UNCERTAIN" | "ERROR" | "UNAVAILABLE";
}

export class Qwen3VlPilotRuntimeFailure extends Error {
  constructor(readonly rows: readonly Qwen3VlPilotInferenceRow[], readonly failedFixtureId: string, readonly errorCode: string) {
    super(`Qwen pilot stopped after runtime failure for ${failedFixtureId}: ${errorCode}`);
  }
}

const sha256 = (value: Buffer) => createHash("sha256").update(value).digest("hex");
const allowedEvaluationOutputRoot = () => path.resolve(process.cwd(), "evaluation-output", "image-moderation");
const isSafeAsset = (asset: string) => Boolean(asset) && !path.isAbsolute(asset) && !asset.includes("\\") && !asset.split("/").includes("..");
const asArray = <T>(value: unknown): readonly T[] => Array.isArray(value) ? value as readonly T[] : [];
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const validateSelection = (selection: readonly Qwen3VlPilotSelection[]) => {
  if (selection.length !== 20 || new Set(selection.map((item) => item.fixtureId)).size !== 20) throw new Error("Qwen pilot must contain exactly 20 unique fixture IDs");
  for (const [stratum, requiredCount] of Object.entries(QWEN3_VL_PILOT_20_STRATUM_COUNTS)) {
    if (selection.filter((item) => item.stratum === stratum).length !== requiredCount) throw new Error(`Qwen pilot selection count mismatch for ${stratum}`);
  }
};

const parseInventory = (raw: unknown): readonly InventoryCandidate[] => {
  if (!isRecord(raw)) throw new Error("Qwen pilot inventory manifest is invalid");
  return asArray<unknown>(raw.candidates).map((item) => {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.state !== "string" || typeof item.localAsset !== "string" || typeof item.sha256 !== "string") throw new Error("Qwen pilot inventory candidate is invalid");
    return { id: item.id, state: item.state, localAsset: item.localAsset, sha256: item.sha256 };
  });
};

const parseReviews = (raw: unknown): readonly ReviewedCandidate[] => {
  if (!isRecord(raw)) throw new Error("Qwen pilot review manifest is invalid");
  return asArray<unknown>(raw.reviews).map((item) => {
    if (!isRecord(item) || typeof item.candidateId !== "string" || typeof item.state !== "string" || (item.expectedDecision !== "PASS" && item.expectedDecision !== "BLOCK")) throw new Error("Qwen pilot review is invalid");
    return { candidateId: item.candidateId, state: item.state, expectedDecision: item.expectedDecision, categories: asArray<ImagePolicyCategory>(item.categories), surfaces: asArray<ImageModerationSurface>(item.surfaces), contextTags: asArray<string>(item.contextTags), coverageClasses: asArray<string>(item.coverageClasses) };
  });
};

const parseAdamCodd = (raw: unknown): readonly AdamCoddResult[] => {
  if (!isRecord(raw)) throw new Error("Qwen pilot AdamCodd result document is invalid");
  return asArray<unknown>(raw.rows).flatMap((item) => isRecord(item) && typeof item.candidateId === "string" && (item.evaluationDecision === "PASS" || item.evaluationDecision === "BLOCK") ? [{ candidateId: item.candidateId, evaluationDecision: item.evaluationDecision }] : []);
};

/** Reads only preselected local source bytes and verifies each frozen inventory hash. */
export const loadQwen3VlPilotInputs = async (input: Readonly<{ benchmarkRoot: string; selection?: readonly Qwen3VlPilotSelection[]; requireCompletePilotSelection?: boolean }>): Promise<readonly Qwen3VlPilotInput[]> => {
  const selection = input.selection ?? QWEN3_VL_PILOT_20;
  if (input.requireCompletePilotSelection ?? true) validateSelection(selection);
  else if (!selection.length || new Set(selection.map((item) => item.fixtureId)).size !== selection.length) throw new Error("Qwen pilot diagnostic selection must contain unique fixture IDs");
  const root = path.resolve(input.benchmarkRoot);
  const inventory = parseInventory(JSON.parse(await readFile(path.join(root, "inventory-manifest.json"), "utf8")));
  const candidates = new Map(inventory.map((candidate) => [candidate.id, candidate]));
  const loaded: Qwen3VlPilotInput[] = [];
  for (const item of selection) {
    const candidate = candidates.get(item.fixtureId);
    if (!candidate || !isSafeAsset(candidate.localAsset) || !/^[a-f0-9]{64}$/.test(candidate.sha256)) throw new Error(`Qwen pilot fixture is unavailable or unsafe: ${item.fixtureId}`);
    const assetPath = path.resolve(root, candidate.localAsset);
    if (!assetPath.startsWith(`${root}${path.sep}`)) throw new Error(`Qwen pilot fixture path escapes benchmark root: ${item.fixtureId}`);
    const metadata = await stat(assetPath);
    if (!metadata.isFile()) throw new Error(`Qwen pilot fixture is not a regular file: ${item.fixtureId}`);
    const bytes = await readFile(assetPath);
    if (sha256(bytes) !== candidate.sha256) throw new Error(`Qwen pilot fixture hash mismatch: ${item.fixtureId}`);
    loaded.push({ selection: item, sourceSha256: candidate.sha256, bytes });
  }
  return Object.freeze(loaded);
};

const neutralFixture = (fixtureId: string): ImageModerationEvaluationFixture => ({
  id: fixtureId,
  description: "Frozen benchmark fixture; labels are intentionally withheld from Qwen inference.",
  asset: "withheld-local-benchmark-asset",
  expectedBySurface: {},
  requiredCapabilities: ["NSFW"],
  difficulty: "CONTEXTUAL",
  tags: ["safe-harness"],
  rationale: "Evaluation-only Qwen pilot input.",
  provenance: { kind: "INTERNAL" },
});

/** Performs strictly sequential evaluation and never passes review metadata to the adapter. */
export const runQwen3VlPilotInference = async (adapter: PilotAdapter, inputs: readonly Qwen3VlPilotInput[]): Promise<readonly Qwen3VlPilotInferenceRow[]> => {
  const rows: Qwen3VlPilotInferenceRow[] = [];
  for (const input of inputs) {
    const before = adapter.getEvaluationRecords().length;
    const response: DetectorEvaluationResult = await adapter.evaluate({ fixture: neutralFixture(input.selection.fixtureId), surface: "CREATOR_SERVICE_MEDIA", assetPath: "withheld-local-benchmark-asset", bytes: input.bytes });
    const record = adapter.getEvaluationRecords()[before];
    if (!record || record.fixtureId !== input.selection.fixtureId) throw new Error(`Qwen pilot runtime record mismatch: ${input.selection.fixtureId}`);
    const completed = response.status === "COMPLETED";
    const qwenStatus = completed ? response.decision : response.status;
    const row = { fixtureId: input.selection.fixtureId, stratum: input.selection.stratum, sourceSha256: input.sourceSha256, qwenStatus, qwenCategories: completed ? response.findings.map((finding) => finding.category) : [], qwenRationale: record.parsed?.reason ?? null, errorCode: completed ? null : response.errorCode, schemaValid: record.schemaValid, inferenceLatencyMs: record.performance?.inferenceLatencyMs ?? null, processRssBytes: record.performance?.processRssBytes ?? null, freeSystemMemoryBytes: record.performance?.freeSystemMemoryBytes ?? null, imagePreparation: record.imagePreparation } satisfies Qwen3VlPilotInferenceRow;
    rows.push(row);
    if (response.status === "UNAVAILABLE") throw new Qwen3VlPilotRuntimeFailure(Object.freeze([...rows]), input.selection.fixtureId, response.errorCode);
  }
  return Object.freeze(rows);
};

const validateReviewForSelection = (selection: Qwen3VlPilotSelection, review: ReviewedCandidate) => {
  const requirement = QWEN3_VL_PILOT_20_REQUIREMENTS[selection.stratum];
  const expectedDecision = selection.expectedDecisionOverride ?? requirement.expectedDecision;
  if (review.state !== "APPROVED" || review.expectedDecision !== expectedDecision || !review.surfaces.includes("CREATOR_SERVICE_MEDIA")) throw new Error(`Qwen pilot reviewed label mismatch: ${selection.fixtureId}`);
  if (requirement.requiredCoverage.length && !requirement.requiredCoverage.some((coverage) => review.coverageClasses.includes(coverage))) throw new Error(`Qwen pilot coverage mismatch: ${selection.fixtureId}`);
  if (requirement.requiredContextTags.some((tag) => !review.contextTags.includes(tag))) throw new Error(`Qwen pilot context mismatch: ${selection.fixtureId}`);
};

const assessment = (humanDecision: "PASS" | "BLOCK", qwenStatus: Qwen3VlPilotInferenceRow["qwenStatus"]): Qwen3VlPilotReportRow["assessment"] => {
  if (qwenStatus === "ERROR" || qwenStatus === "UNAVAILABLE") return qwenStatus;
  if (qwenStatus === "UNCERTAIN") return "UNCERTAIN";
  return qwenStatus === humanDecision ? "CORRECT" : "INCORRECT";
};

/** Loads human/AdamCodd records only after Qwen inference has finished. */
export const buildQwen3VlPilotReport = async (input: Readonly<{ benchmarkRoot: string; adamCoddResultsPath: string; inferenceRows: readonly Qwen3VlPilotInferenceRow[]; candidateMetadata: unknown }>) => {
  if (input.inferenceRows.length !== 20 || new Set(input.inferenceRows.map((row) => row.fixtureId)).size !== 20) throw new Error("Qwen pilot report requires exactly 20 unique inference rows");
  const root = path.resolve(input.benchmarkRoot);
  const reviews = new Map(parseReviews(JSON.parse(await readFile(path.join(root, "review-manifest.json"), "utf8"))).map((review) => [review.candidateId, review]));
  const adam = new Map(parseAdamCodd(JSON.parse(await readFile(path.resolve(input.adamCoddResultsPath), "utf8"))).map((row) => [row.candidateId, row]));
  const selectionById = new Map(QWEN3_VL_PILOT_20.map((item) => [item.fixtureId, item]));
  const rows: Qwen3VlPilotReportRow[] = input.inferenceRows.map((row) => {
    const selection = selectionById.get(row.fixtureId); const review = reviews.get(row.fixtureId);
    if (!selection || !review) throw new Error(`Qwen pilot review is missing: ${row.fixtureId}`);
    validateReviewForSelection(selection, review);
    return { ...row, contextTags: review.contextTags, humanDecision: review.expectedDecision, humanCategories: review.categories, adamCoddDecision: adam.get(row.fixtureId)?.evaluationDecision ?? null, assessment: assessment(review.expectedDecision, row.qwenStatus) };
  });
  const count = (predicate: (row: Qwen3VlPilotReportRow) => boolean) => rows.filter(predicate).length;
  const outcomeKeys = ["PASS", "BLOCK", "UNCERTAIN", "ERROR", "UNAVAILABLE"] as const;
  const confusion = Object.fromEntries(["PASS", "BLOCK"].flatMap((human) => outcomeKeys.map((qwen) => [`HUMAN_${human}__QWEN_${qwen}`, count((row) => row.humanDecision === human && row.qwenStatus === qwen)])));
  const byStratum = Object.fromEntries(Object.keys(QWEN3_VL_PILOT_20_STRATUM_COUNTS).map((stratum) => {
    const subset = rows.filter((row) => row.stratum === stratum);
    return [stratum, { total: subset.length, correct: subset.filter((row) => row.assessment === "CORRECT").length, incorrect: subset.filter((row) => row.assessment === "INCORRECT").length, uncertain: subset.filter((row) => row.assessment === "UNCERTAIN").length, errors: subset.filter((row) => row.assessment === "ERROR").length, unavailable: subset.filter((row) => row.assessment === "UNAVAILABLE").length }];
  }));
  const latencies = rows.map((row) => row.inferenceLatencyMs).filter((value): value is number => value !== null).sort((a, b) => a - b);
  const totalLatencyMs = latencies.reduce((total, value) => total + value, 0);
  return Object.freeze({ schemaVersion: "STHN_QWEN3_VL_PILOT_REPORT_V1", pilotVersion: "STHN_QWEN3_VL_PILOT_20_V1", attempted: rows.length, completed: count((row) => row.qwenStatus === "PASS" || row.qwenStatus === "BLOCK" || row.qwenStatus === "UNCERTAIN"), statusCounts: Object.fromEntries(outcomeKeys.map((status) => [status, count((row) => row.qwenStatus === status)])), rawOutputSchema: { valid: count((row) => row.schemaValid), invalid: count((row) => !row.schemaValid) }, confusion, falseBlocks: rows.filter((row) => row.humanDecision === "PASS" && row.qwenStatus === "BLOCK").map((row) => row.fixtureId), falseApprovals: rows.filter((row) => row.humanDecision === "BLOCK" && row.qwenStatus === "PASS").map((row) => row.fixtureId), adamCoddAgreement: { matchingQwenDecision: count((row) => row.adamCoddDecision !== null && row.adamCoddDecision === row.qwenStatus), adamCoddCorrect: count((row) => row.adamCoddDecision === row.humanDecision), qwenCorrect: count((row) => row.assessment === "CORRECT") }, byStratum, timing: { totalInferenceLatencyMs: totalLatencyMs, averageInferenceLatencyMs: latencies.length ? totalLatencyMs / latencies.length : null, minInferenceLatencyMs: latencies[0] ?? null, maxInferenceLatencyMs: latencies.length ? latencies[latencies.length - 1] : null }, candidateMetadata: input.candidateMetadata, rows: Object.freeze(rows) });
};

export const writeQwen3VlPilotReport = async (report: unknown, outputDirectory: string) => {
  const root = allowedEvaluationOutputRoot(); const destination = path.resolve(outputDirectory);
  if (!destination.startsWith(`${root}${path.sep}`)) throw new Error("Qwen pilot report must remain under evaluation-output/image-moderation");
  try { await access(destination); throw new Error("Qwen pilot output directory already exists"); } catch (error) { if (error instanceof Error && error.message === "Qwen pilot output directory already exists") throw error; }
  await mkdir(destination, { recursive: true });
  const reportPath = path.join(destination, "pilot-report.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  return Object.freeze({ reportPath });
};
