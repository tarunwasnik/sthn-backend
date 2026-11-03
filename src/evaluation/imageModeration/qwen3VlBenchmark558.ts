import { createHash } from "node:crypto";
import { access, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { DetectorEvaluationResult, ImageModerationEvaluationFixture, ImageModerationSurface, ImagePolicyCategory } from "./imageModerationEvaluation.types";
import { Qwen3VlEvaluationRecord, Qwen3VlOfflineEvaluationAdapter } from "./qwen3VlOfflineEvaluation";

export const QWEN3_VL_558_RUN_ID = "STHN_QWEN3_VL_V2C_558_V1";
export const QWEN3_VL_558_FIXTURE_SET_SHA256 = "c38c21141d65e25b2a0dbf5c1fc90847a3920f8fe4dfe437a9cc9cdf2deb5c5b";
export const QWEN3_VL_558_OUTPUT_DIRECTORY_NAME = "qwen3-vl-v2c-558";
export const QWEN3_VL_558_CONFIG = Object.freeze({
  runId: QWEN3_VL_558_RUN_ID,
  modelId: "Qwen/Qwen3-VL-2B-Instruct-GGUF",
  revision: "52d6c8ffea26cc873ac5ad116f8631268d7eb503",
  modelFilename: "Qwen3VL-2B-Instruct-Q4_K_M.gguf",
  modelSha256: "089d75c52f4b7ffc56ba998ffc50aae89fcafc755f9e7208aacca281dca6c2ae",
  projectorFilename: "mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf",
  projectorSha256: "f9a68fabba69c3b81e153367b2c7521030b0fa8bb0de400c9599c8e6725f9c82",
  runtime: Object.freeze({ identity: "llama.cpp llama-mtmd-cli", build: "b8074", commit: "d23a55997", executable: "llama-mtmd-cli.exe", temperature: 0 as const, maxOutputTokens: 160, contextSize: 4096, timeoutMs: 300_000 }),
  policyId: "STHN_QWEN3_VL_SEXUAL_CONTENT_EVALUATION_POLICY_V1",
  promptId: "STHN_QWEN3_VL_SEXUAL_CONTENT_PROMPT_V2",
  outputSchemaId: "STHN_QWEN3_VL_SEXUAL_CONTENT_OUTPUT_SCHEMA_V2",
  preprocessingId: "STHN_QWEN3_VL_EVALUATION_DERIVATIVE_V1",
  fixtureSetSha256: QWEN3_VL_558_FIXTURE_SET_SHA256,
});

type Decision = "PASS" | "BLOCK";
type QwenStatus = "PASS" | "BLOCK" | "UNCERTAIN";
type RecordLike = Record<string, unknown>;
type Inventory = Readonly<{ id: string; localAsset: string; sha256: string }>;
type Review = Readonly<{ candidateId: string; state: string; expectedDecision: Decision; categories: readonly ImagePolicyCategory[]; contextTags: readonly string[] }>;
type Adam = Readonly<{ candidateId: string; evaluationDecision: Decision }>;
type Adapter = Pick<Qwen3VlOfflineEvaluationAdapter, "evaluate" | "getEvaluationRecords">;

export interface Qwen3VlBenchmarkFixture { readonly id: string; readonly localAsset: string; readonly sha256: string; readonly bytes: Buffer; }
export interface Qwen3VlBenchmarkCheckpoint {
  readonly schemaVersion: "STHN_QWEN3_VL_558_CHECKPOINT_V1";
  readonly runId: typeof QWEN3_VL_558_RUN_ID;
  readonly configuration: typeof QWEN3_VL_558_CONFIG;
  readonly fixtureId: string;
  readonly sourceSha256: string;
  readonly completedAt: string;
  readonly rawOutput: string;
  readonly parsed: Readonly<{ decision: QwenStatus; categories: readonly ImagePolicyCategory[]; reason: string }>;
  readonly performance: Qwen3VlEvaluationRecord["performance"];
  readonly imagePreparation: Qwen3VlEvaluationRecord["imagePreparation"];
}

export class Qwen3VlBenchmarkStopped extends Error {
  constructor(readonly fixtureId: string, readonly errorCode: string, readonly record: Qwen3VlEvaluationRecord | null) { super(`Qwen 558 benchmark stopped at ${fixtureId}: ${errorCode}`); }
}

const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const isRecord = (value: unknown): value is RecordLike => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const asStrings = (value: unknown) => Array.isArray(value) && value.every((item) => typeof item === "string") ? value : [];
const safeAsset = (asset: string) => Boolean(asset) && !path.isAbsolute(asset) && !asset.includes("\\") && !asset.split("/").includes("..");
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const outputRoot = () => path.resolve(process.cwd(), "evaluation-output", "image-moderation");
const checkpointDirectory = (directory: string) => path.join(directory, "checkpoints");
const checkpointPath = (directory: string, index: number, fixtureId: string) => path.join(checkpointDirectory(directory), `${String(index).padStart(4, "0")}-${fixtureId}.json`);
const neutralFixture = (id: string): ImageModerationEvaluationFixture => ({ id, description: "Frozen benchmark fixture; labels are intentionally withheld from Qwen inference.", asset: "withheld-local-benchmark-asset", expectedBySurface: {}, requiredCapabilities: ["NSFW"], difficulty: "CONTEXTUAL", tags: ["safe-harness"], rationale: "Evaluation-only Qwen benchmark input.", provenance: { kind: "INTERNAL" } });

const parseInventory = (raw: unknown): readonly Inventory[] => {
  if (!isRecord(raw) || !Array.isArray(raw.candidates)) throw new Error("Qwen 558 inventory manifest is invalid");
  return raw.candidates.map((value): Inventory => {
    if (!isRecord(value) || typeof value.id !== "string" || typeof value.localAsset !== "string" || typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.sha256)) throw new Error("Qwen 558 inventory candidate is invalid");
    return { id: value.id, localAsset: value.localAsset, sha256: value.sha256 };
  });
};
const parseReviews = (raw: unknown): readonly Review[] => {
  if (!isRecord(raw) || !Array.isArray(raw.reviews)) throw new Error("Qwen 558 review manifest is invalid");
  return raw.reviews.map((value): Review => {
    if (!isRecord(value) || typeof value.candidateId !== "string" || typeof value.state !== "string" || (value.expectedDecision !== "PASS" && value.expectedDecision !== "BLOCK")) throw new Error("Qwen 558 review is invalid");
    return { candidateId: value.candidateId, state: value.state, expectedDecision: value.expectedDecision, categories: asStrings(value.categories) as ImagePolicyCategory[], contextTags: asStrings(value.contextTags) };
  });
};
const parseAdam = (raw: unknown): readonly Adam[] => {
  if (!isRecord(raw) || !Array.isArray(raw.rows)) throw new Error("Qwen 558 AdamCodd results are invalid");
  return raw.rows.flatMap((value): Adam[] => isRecord(value) && typeof value.candidateId === "string" && (value.evaluationDecision === "PASS" || value.evaluationDecision === "BLOCK") ? [{ candidateId: value.candidateId, evaluationDecision: value.evaluationDecision }] : []);
};

/** Loads only verified frozen bytes in deterministic candidate-ID order; review labels never enter this path. */
export const loadQwen3VlBenchmark558Fixtures = async (benchmarkRoot: string, expectedCount = 558): Promise<readonly Qwen3VlBenchmarkFixture[]> => {
  const root = path.resolve(benchmarkRoot);
  const [inventoryRaw, reviewsRaw] = await Promise.all([readFile(path.join(root, "inventory-manifest.json"), "utf8"), readFile(path.join(root, "review-manifest.json"), "utf8")]);
  const approved = new Set(parseReviews(JSON.parse(reviewsRaw)).filter((review) => review.state === "APPROVED").map((review) => review.candidateId));
  const fixtures = parseInventory(JSON.parse(inventoryRaw)).filter((candidate) => approved.has(candidate.id)).sort((a, b) => a.id.localeCompare(b.id));
  if (fixtures.length !== expectedCount || new Set(fixtures.map((fixture) => fixture.id)).size !== expectedCount) throw new Error(`Qwen 558 fixture count mismatch: expected ${expectedCount}, found ${fixtures.length}`);
  if (expectedCount === 558 && sha256(JSON.stringify(fixtures.map((fixture) => [fixture.id, fixture.sha256]))) !== QWEN3_VL_558_FIXTURE_SET_SHA256) throw new Error("Qwen 558 frozen fixture set hash mismatch");
  const result: Qwen3VlBenchmarkFixture[] = [];
  for (const fixture of fixtures) {
    if (!safeAsset(fixture.localAsset)) throw new Error(`Qwen 558 fixture asset is unsafe: ${fixture.id}`);
    const assetPath = path.resolve(root, fixture.localAsset);
    if (!assetPath.startsWith(`${root}${path.sep}`) || !(await stat(assetPath)).isFile()) throw new Error(`Qwen 558 fixture is unavailable: ${fixture.id}`);
    const bytes = await readFile(assetPath);
    if (sha256(bytes) !== fixture.sha256) throw new Error(`Qwen 558 fixture hash mismatch: ${fixture.id}`);
    result.push({ ...fixture, bytes });
  }
  return Object.freeze(result);
};

const atomicWrite = async (destination: string, value: unknown) => {
  await mkdir(path.dirname(destination), { recursive: true });
  try { await access(destination); throw new Error(`Qwen 558 artifact already exists: ${path.basename(destination)}`); } catch (error) { if (error instanceof Error && error.message.startsWith("Qwen 558 artifact already exists")) throw error; }
  const temporary = `${destination}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, json(value), { encoding: "utf8", flag: "wx" });
  await rename(temporary, destination);
};
const configEqual = (value: unknown) => JSON.stringify(value) === JSON.stringify(QWEN3_VL_558_CONFIG);

export const createQwen3VlBenchmark558Run = async (directory: string, fixtures: readonly Qwen3VlBenchmarkFixture[]) => {
  const destination = path.resolve(directory);
  if (!destination.startsWith(`${outputRoot()}${path.sep}`)) throw new Error("Qwen 558 output must remain under evaluation-output/image-moderation");
  try { await access(destination); throw new Error("Qwen 558 run directory already exists"); } catch (error) { if (error instanceof Error && error.message === "Qwen 558 run directory already exists") throw error; }
  await mkdir(destination, { recursive: true });
  await atomicWrite(path.join(destination, "run-manifest.json"), { schemaVersion: "STHN_QWEN3_VL_558_RUN_V1", runId: QWEN3_VL_558_RUN_ID, configuration: QWEN3_VL_558_CONFIG, createdAt: new Date().toISOString(), fixtures: fixtures.map((fixture) => ({ id: fixture.id, sha256: fixture.sha256, localAsset: fixture.localAsset })) });
};

const loadManifest = async (directory: string, fixtures: readonly Qwen3VlBenchmarkFixture[]) => {
  const manifest = JSON.parse(await readFile(path.join(directory, "run-manifest.json"), "utf8")) as unknown;
  if (!isRecord(manifest) || manifest.runId !== QWEN3_VL_558_RUN_ID || !configEqual(manifest.configuration) || !Array.isArray(manifest.fixtures)) throw new Error("Qwen 558 run manifest is incompatible");
  const actual = manifest.fixtures.map((value) => isRecord(value) ? [value.id, value.sha256, value.localAsset] : null);
  const expected = fixtures.map((fixture) => [fixture.id, fixture.sha256, fixture.localAsset]);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("Qwen 558 run fixture manifest mismatch");
};
const parseCheckpoint = (raw: unknown): Qwen3VlBenchmarkCheckpoint => {
  if (!isRecord(raw) || raw.schemaVersion !== "STHN_QWEN3_VL_558_CHECKPOINT_V1" || raw.runId !== QWEN3_VL_558_RUN_ID || !configEqual(raw.configuration) || typeof raw.fixtureId !== "string" || typeof raw.sourceSha256 !== "string" || typeof raw.rawOutput !== "string" || !isRecord(raw.parsed) || (raw.parsed.decision !== "PASS" && raw.parsed.decision !== "BLOCK" && raw.parsed.decision !== "UNCERTAIN") || !Array.isArray(raw.parsed.categories) || typeof raw.parsed.reason !== "string" || typeof raw.completedAt !== "string") throw new Error("Qwen 558 checkpoint is corrupt");
  return raw as unknown as Qwen3VlBenchmarkCheckpoint;
};
export const loadQwen3VlBenchmark558Resume = async (directory: string, fixtures: readonly Qwen3VlBenchmarkFixture[]) => {
  const destination = path.resolve(directory); await loadManifest(destination, fixtures);
  try { await access(path.join(destination, "failure.json")); throw new Error("Qwen 558 run is stopped by a recorded failure; do not retry without explicit approval"); } catch (error) { if (error instanceof Error && error.message.includes("recorded failure")) throw error; }
  const completed: Qwen3VlBenchmarkCheckpoint[] = [];
  for (const [index, fixture] of fixtures.entries()) {
    const file = checkpointPath(destination, index, fixture.id);
    try { const checkpoint = parseCheckpoint(JSON.parse(await readFile(file, "utf8"))); if (checkpoint.fixtureId !== fixture.id || checkpoint.sourceSha256 !== fixture.sha256) throw new Error("Qwen 558 checkpoint fixture mismatch"); completed.push(checkpoint); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") { for (const later of fixtures.slice(index + 1)) { try { await access(checkpointPath(destination, fixtures.indexOf(later), later.id)); throw new Error("Qwen 558 checkpoints are not a sequential prefix"); } catch (inner) { if (inner instanceof Error && inner.message.includes("sequential prefix")) throw inner; } } break; } throw error; }
  }
  return Object.freeze(completed);
};

const checkpointFromRecord = (fixture: Qwen3VlBenchmarkFixture, record: Qwen3VlEvaluationRecord): Qwen3VlBenchmarkCheckpoint => {
  if (record.runtimeStatus !== "COMPLETED" || !record.schemaValid || !record.rawOutput || !record.parsed) throw new Error(record.errorCode ?? "QWEN_558_RECORD_INVALID");
  return Object.freeze({ schemaVersion: "STHN_QWEN3_VL_558_CHECKPOINT_V1", runId: QWEN3_VL_558_RUN_ID, configuration: QWEN3_VL_558_CONFIG, fixtureId: fixture.id, sourceSha256: fixture.sha256, completedAt: new Date().toISOString(), rawOutput: record.rawOutput, parsed: record.parsed, performance: record.performance, imagePreparation: record.imagePreparation });
};
/** Executes only after a caller deliberately creates or resumes a run. It is sequential and stops on every technical or parser failure. */
export const executeQwen3VlBenchmark558 = async (adapter: Adapter, fixtures: readonly Qwen3VlBenchmarkFixture[], directory: string, completed: readonly Qwen3VlBenchmarkCheckpoint[]) => {
  for (let index = completed.length; index < fixtures.length; index += 1) {
    const fixture = fixtures[index]; const before = adapter.getEvaluationRecords().length;
    let response: DetectorEvaluationResult;
    try { response = await adapter.evaluate({ fixture: neutralFixture(fixture.id), surface: "CREATOR_SERVICE_MEDIA" as ImageModerationSurface, assetPath: "withheld-local-benchmark-asset", bytes: fixture.bytes }); }
    catch { await atomicWrite(path.join(directory, "failure.json"), { fixtureId: fixture.id, errorCode: "QWEN_RUNTIME_EXECUTION_ERROR", recordedAt: new Date().toISOString() }); throw new Qwen3VlBenchmarkStopped(fixture.id, "QWEN_RUNTIME_EXECUTION_ERROR", null); }
    const record = adapter.getEvaluationRecords()[before] ?? null;
    if (response.status !== "COMPLETED" || !record || record.runtimeStatus !== "COMPLETED" || !record.schemaValid) { const errorCode = response.status === "COMPLETED" ? record?.errorCode ?? "QWEN_558_RECORD_INVALID" : response.errorCode; await atomicWrite(path.join(directory, "failure.json"), { fixtureId: fixture.id, errorCode, record, recordedAt: new Date().toISOString() }); throw new Qwen3VlBenchmarkStopped(fixture.id, errorCode, record); }
    await atomicWrite(checkpointPath(directory, index, fixture.id), checkpointFromRecord(fixture, record));
  }
};

export const mapQwenAdmissionDecision = (raw: QwenStatus): Decision => raw === "PASS" ? "PASS" : "BLOCK";
const binaryMetrics = (rows: readonly Readonly<{ humanDecision: Decision; actualDecision: Decision }>[]) => {
  const count = (human: Decision, actual: Decision) => rows.filter((row) => row.humanDecision === human && row.actualDecision === actual).length;
  const pp = count("PASS", "PASS"), pb = count("PASS", "BLOCK"), bp = count("BLOCK", "PASS"), bb = count("BLOCK", "BLOCK");
  const recall = (n: number, d: number) => d ? n / d : null; const blockRecall = recall(bb, bb + bp), passSpecificity = recall(pp, pp + pb);
  return { total: rows.length, correct: pp + bb, accuracy: rows.length ? (pp + bb) / rows.length : null, confusion: { HUMAN_PASS__MODEL_PASS: pp, HUMAN_PASS__MODEL_BLOCK: pb, HUMAN_BLOCK__MODEL_PASS: bp, HUMAN_BLOCK__MODEL_BLOCK: bb }, falseBlocks: rows.filter((row) => row.humanDecision === "PASS" && row.actualDecision === "BLOCK").length, falseApprovals: rows.filter((row) => row.humanDecision === "BLOCK" && row.actualDecision === "PASS").length, blockRecall, passSpecificity, balancedAccuracy: blockRecall === null || passSpecificity === null ? null : (blockRecall + passSpecificity) / 2 };
};
export const buildQwen3VlBenchmark558Report = async (input: Readonly<{ benchmarkRoot: string; adamCoddResultsPath: string; fixtures: readonly Qwen3VlBenchmarkFixture[]; checkpoints: readonly Qwen3VlBenchmarkCheckpoint[]; candidateMetadata: unknown }>) => {
  if (input.checkpoints.length !== input.fixtures.length) throw new Error("Qwen 558 report requires a complete sequential run");
  const root = path.resolve(input.benchmarkRoot); const reviews = new Map(parseReviews(JSON.parse(await readFile(path.join(root, "review-manifest.json"), "utf8"))).filter((review) => review.state === "APPROVED").map((review) => [review.candidateId, review])); const adam = new Map(parseAdam(JSON.parse(await readFile(input.adamCoddResultsPath, "utf8"))).map((row) => [row.candidateId, row.evaluationDecision]));
  const rows = input.checkpoints.map((checkpoint) => { const review = reviews.get(checkpoint.fixtureId); if (!review) throw new Error(`Qwen 558 review is unavailable: ${checkpoint.fixtureId}`); const rawDecision = checkpoint.parsed.decision; return { fixtureId: checkpoint.fixtureId, sourceSha256: checkpoint.sourceSha256, humanDecision: review.expectedDecision, humanCategories: review.categories, contextTags: review.contextTags, adamCoddDecision: adam.get(checkpoint.fixtureId) ?? null, rawQwenDecision: rawDecision, mappedAdmissionDecision: mapQwenAdmissionDecision(rawDecision), qwenCategories: checkpoint.parsed.categories, qwenRationale: checkpoint.parsed.reason, rawAssessment: rawDecision === "UNCERTAIN" ? "UNCERTAIN" : rawDecision === review.expectedDecision ? "CORRECT" : "INCORRECT", mappedAssessment: mapQwenAdmissionDecision(rawDecision) === review.expectedDecision ? "CORRECT" : "INCORRECT", performance: checkpoint.performance, imagePreparation: checkpoint.imagePreparation }; });
  const decisiveMetrics = binaryMetrics(rows.filter((row) => row.rawQwenDecision !== "UNCERTAIN").map((row) => ({ humanDecision: row.humanDecision, actualDecision: row.rawQwenDecision as Decision })));
  const raw = { counts: Object.fromEntries((["PASS", "BLOCK", "UNCERTAIN"] as const).map((status) => [status, rows.filter((row) => row.rawQwenDecision === status).length])), confusion: Object.fromEntries((["PASS", "BLOCK"] as const).flatMap((human) => (["PASS", "BLOCK", "UNCERTAIN"] as const).map((actual) => [`HUMAN_${human}__QWEN_${actual}`, rows.filter((row) => row.humanDecision === human && row.rawQwenDecision === actual).length]))), decisiveCoverage: rows.length ? rows.filter((row) => row.rawQwenDecision !== "UNCERTAIN").length / rows.length : null, decisiveAccuracy: (() => { const decisive = rows.filter((row) => row.rawQwenDecision !== "UNCERTAIN"); return decisive.length ? decisive.filter((row) => row.rawAssessment === "CORRECT").length / decisive.length : null; })(), overallAccuracy: rows.length ? rows.filter((row) => row.rawAssessment === "CORRECT").length / rows.length : null, nondecisions: rows.filter((row) => row.rawQwenDecision === "UNCERTAIN").length, falseBlocks: decisiveMetrics.falseBlocks, falseApprovals: decisiveMetrics.falseApprovals, blockRecall: decisiveMetrics.blockRecall, passSpecificity: decisiveMetrics.passSpecificity, balancedAccuracy: decisiveMetrics.balancedAccuracy };
  const mapped = { counts: Object.fromEntries((["PASS", "BLOCK"] as const).map((status) => [status, rows.filter((row) => row.mappedAdmissionDecision === status).length])), ...binaryMetrics(rows.map((row) => ({ humanDecision: row.humanDecision, actualDecision: row.mappedAdmissionDecision }))) };
  const adamRows = rows.filter((row): row is typeof row & { adamCoddDecision: Decision } => row.adamCoddDecision !== null); const adamMetrics = binaryMetrics(adamRows.map((row) => ({ humanDecision: row.humanDecision, actualDecision: row.adamCoddDecision })));
  const contextKeys = [...new Set(rows.flatMap((row) => [...row.contextTags, ...row.humanCategories]))].sort(); const contextBreakdown = Object.fromEntries(contextKeys.map((key) => { const subset = rows.filter((row) => row.contextTags.includes(key) || row.humanCategories.includes(key as ImagePolicyCategory)); return [key, { total: subset.length, raw: { correct: subset.filter((row) => row.rawAssessment === "CORRECT").length, uncertain: subset.filter((row) => row.rawAssessment === "UNCERTAIN").length }, mapped: binaryMetrics(subset.map((row) => ({ humanDecision: row.humanDecision, actualDecision: row.mappedAdmissionDecision }))) }]; }));
  return Object.freeze({ schemaVersion: "STHN_QWEN3_VL_558_REPORT_V1", runId: QWEN3_VL_558_RUN_ID, completed: rows.length, configuration: QWEN3_VL_558_CONFIG, candidateMetadata: input.candidateMetadata, rawQwen: raw, mappedAdmission: mapped, adamCodd: adamMetrics, comparison: { correctedAdamCoddMistakes: rows.filter((row) => row.adamCoddDecision !== null && row.adamCoddDecision !== row.humanDecision && row.mappedAdmissionDecision === row.humanDecision).map((row) => row.fixtureId), newlyIntroducedQwenMistakes: rows.filter((row) => row.adamCoddDecision === row.humanDecision && row.mappedAdmissionDecision !== row.humanDecision).map((row) => row.fixtureId), bothIncorrect: rows.filter((row) => row.adamCoddDecision !== null && row.adamCoddDecision !== row.humanDecision && row.mappedAdmissionDecision !== row.humanDecision).map((row) => row.fixtureId) }, contextBreakdown, rows });
};

export const writeQwen3VlBenchmark558Report = async (directory: string, report: unknown) => atomicWrite(path.join(directory, "benchmark-report.json"), report);
export const qwen3VlBenchmark558OutputDirectory = () => path.join(outputRoot(), QWEN3_VL_558_OUTPUT_DIRECTORY_NAME);
