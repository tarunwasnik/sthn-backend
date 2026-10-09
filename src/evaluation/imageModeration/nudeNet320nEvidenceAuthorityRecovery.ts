import { createHash } from "node:crypto";
import { access, constants, readFile } from "node:fs/promises";
import path from "node:path";
import { loadManualBenchmarkManifest, manualBenchmarkRoot } from "./dataset/manualBenchmarkInventory.service";
import { loadLocalReviewManifest } from "./dataset/sexualContentReview.service";

export const G8A_CURRENT_BYTES = Object.freeze({
  report: "ed47038e486190d1f108452b3f6ecfc11567580b24716c7f686031c4f3616710",
  perImage: "7f6a70319e93429bcdcc35c5a0d705f319a11a5aacfee13e498ce218ea3ca5ae",
  classSummary: "f8a9880dbdf12ad463da7dfef516fa207ea3ee01d574055c3df2036b3196ebe4",
  markdown: "cd2b2c9d543fa0c007a38a7df808897ce51b5e93b852c1ddf60ae3a5f0baa9d6",
});
export const sha256 = (value: Buffer | string): string => createHash("sha256").update(value).digest("hex");
export const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
};
export const g8aOutputDirectory = (root = process.cwd()): string => path.join(root, "evaluation-output", "image-moderation", "i4-g8a-nudenet-development-evaluation");
export const assertG8AOutputDirectoryAbsent = async (directory = g8aOutputDirectory()): Promise<void> => {
  try { await access(directory, constants.F_OK); throw new Error(`Refusing to overwrite frozen G8-A evidence directory: ${directory}`); }
  catch (error) { if (error instanceof Error && error.message.startsWith("Refusing")) throw error; }
};

type EvidenceRow = Readonly<{ candidateId: string; candidateSha256: string; humanDecision: "PASS" | "BLOCK"; classifications: readonly string[]; categories: readonly string[]; contexts: readonly string[]; detections: readonly Readonly<{ nativeClass: string; confidence: number; box: readonly number[] }>[] }>;
type G8AReport = Readonly<{ developmentCorpus: Readonly<{ candidates: number; approved: number; pass: number; block: number; candidateFingerprint: string; fixtureIdentity: string }>; g7Sha256: string; g1Sha256: string; modelSha256: string; semanticGrouping: Readonly<{ EXPOSED_ANATOMY: readonly string[]; COVERED_ANATOMY: readonly string[] }>; crossCorpusAuthorityBoundary: Readonly<{ g3ReviewedSwimwearCandidates: number; exactCandidateIdOverlap: number; conclusion: string }>; execution: Readonly<{ total: number; successful: number; failed: number }>; overall: Readonly<{ total: number; anyDetection: number; exposedSignal: number; coveredSignal: number }>; byClassification: unknown; byCategory: unknown; byContext: unknown; transparentClothing: string; specialistRole: string; suggestivePresentationSpecialistStillRequired: string; prohibitions: unknown }>;

export type G8AR1Validation = Readonly<{ report: G8AReport; rows: readonly EvidenceRow[]; byteHashes: typeof G8A_CURRENT_BYTES; semanticPayload: Record<string, unknown>; semanticFingerprint: string }>;
const same = (actual: unknown, expected: unknown, label: string): void => { if (canonicalJson(actual) !== canonicalJson(expected)) throw new Error(`G8-A evidence mismatch: ${label}`); };
const summary = (rows: readonly EvidenceRow[], classes: readonly string[]) => ({ total: rows.length, anyDetection: rows.filter((row) => row.detections.length > 0).length, exposedSignal: rows.filter((row) => row.detections.some((d) => classes.includes(d.nativeClass))).length });

export const validateCurrentG8AEvidence = async (root = process.cwd()): Promise<G8AR1Validation> => {
  const output = g8aOutputDirectory(root);
  const files = { report: "g8a-nudenet-development-evaluation.json", perImage: "g8a-nudenet-per-image-results.json", classSummary: "g8a-nudenet-class-summary.json", markdown: "g8a-nudenet-development-evaluation.md" } as const;
  const bytes = await Promise.all(Object.values(files).map((file) => readFile(path.join(output, file))));
  const byteHashes = Object.fromEntries(Object.keys(files).map((key, index) => [key, sha256(bytes[index])])) as typeof G8A_CURRENT_BYTES;
  same(byteHashes, G8A_CURRENT_BYTES, "frozen current byte identity");
  const report = JSON.parse(bytes[0].toString("utf8")) as G8AReport;
  const rows = JSON.parse(bytes[1].toString("utf8")) as EvidenceRow[];
  const classSummary = JSON.parse(bytes[2].toString("utf8"));
  const markdown = bytes[3].toString("utf8");
  if (rows.length !== 558 || new Set(rows.map((row) => row.candidateId)).size !== 558) throw new Error("G8-A evidence must contain 558 unique rows");
  const [manifest, reviewManifest] = await Promise.all([loadManualBenchmarkManifest(manualBenchmarkRoot(root)), loadLocalReviewManifest(manualBenchmarkRoot(root))]);
  const reviews = new Map(reviewManifest.reviews.filter((review) => review.state === "APPROVED").map((review) => [review.candidateId, review]));
  const candidates = manifest.candidates.filter((candidate) => reviews.has(candidate.id)).sort((a, b) => a.id.localeCompare(b.id));
  const candidateFingerprint = sha256(JSON.stringify(candidates.map((candidate) => [candidate.id, candidate.sha256])));
  if (candidates.length !== 558 || candidateFingerprint !== "c38c21141d65e25b2a0dbf5c1fc90847a3920f8fe4dfe437a9cc9cdf2deb5c5b") throw new Error("Frozen V1 candidate authority mismatch");
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  for (const row of rows) {
    const candidate = byId.get(row.candidateId); const review = reviews.get(row.candidateId);
    if (!candidate || !review || candidate.sha256 !== row.candidateSha256) throw new Error(`G8-A row identity mismatch: ${row.candidateId}`);
    same(row.humanDecision, review.expectedDecision, `human decision ${row.candidateId}`);
    same(row.classifications, review.coverageClasses?.length ? review.coverageClasses : [candidate.coverageClass], `classification ${row.candidateId}`);
    same(row.categories, review.categories ?? [], `categories ${row.candidateId}`);
    same(row.contexts, review.contextTags ?? [], `contexts ${row.candidateId}`);
    if (!Array.isArray(row.detections)) throw new Error(`G8-A malformed detections: ${row.candidateId}`);
  }
  const pass = rows.filter((row) => row.humanDecision === "PASS").length, block = rows.filter((row) => row.humanDecision === "BLOCK").length;
  const exposed = report.semanticGrouping.EXPOSED_ANATOMY, covered = report.semanticGrouping.COVERED_ANATOMY;
  const aggregate = { total: rows.length, anyDetection: rows.filter((row) => row.detections.length > 0).length, exposedSignal: rows.filter((row) => row.detections.some((d) => exposed.includes(d.nativeClass))).length, coveredSignal: rows.filter((row) => row.detections.some((d) => covered.includes(d.nativeClass))).length };
  same({ candidates: 558, approved: 558, pass: 260, block: 298, candidateFingerprint, fixtureIdentity: "71f6d79fe1a0249d7085029f37211da4573a746378818f826da3e21afc0fb42f" }, report.developmentCorpus, "corpus authority");
  if (pass !== 260 || block !== 298) throw new Error("G8-A decision totals mismatch");
  same(aggregate, report.overall, "overall aggregate"); same(aggregate, classSummary.overall, "class summary aggregate");
  if (report.execution.total !== 558 || report.execution.successful !== 558 || report.execution.failed !== 0) throw new Error("G8-A execution accounting mismatch");
  if (report.g7Sha256 !== "c007c6b47c4a31e3344c0fe0c55043ab051d6a0fe4352185d25d64ffbfcd2794" || report.g1Sha256 !== "2ff448628b2568fd8a8f6b4a5cc38ecaf026976337515284f6629bc45ec88fa1" || report.modelSha256 !== "c15d8273adad2d0a92f014cc69ab2d6c311a06777a55545f2c4eb46f51911f0f") throw new Error("G8-A model/runtime authority mismatch");
  const g1 = JSON.parse(await readFile(path.join(root, "evaluation-output", "image-moderation", "i4-g1-professional-image-policy-v2", "professional-image-policy-v2.json"), "utf8")) as { policyFingerprint?: string };
  if (g1.policyFingerprint !== "362a1f1af446c96188ee8750e7fcdfb661d9ce83d53d580f4c0b9a93e08ef68f") throw new Error("Frozen G1 semantic authority mismatch");
  if (report.crossCorpusAuthorityBoundary.g3ReviewedSwimwearCandidates !== 13 || report.crossCorpusAuthorityBoundary.exactCandidateIdOverlap !== 0 || report.crossCorpusAuthorityBoundary.conclusion !== "NOT_APPLICABLE_TO_V1_DEVELOPMENT_CORPUS") throw new Error("G8-A cross-corpus boundary mismatch");
  if (!markdown.includes("NOT_APPLICABLE_TO_V1_DEVELOPMENT_CORPUS")) throw new Error("G8-A markdown boundary mismatch");
  const orderedRows = [...rows].sort((a, b) => a.candidateId.localeCompare(b.candidateId)).map((row) => ({ candidateId: row.candidateId, candidateSha256: row.candidateSha256, humanDecision: row.humanDecision, classifications: [...row.classifications], categories: [...row.categories], contexts: [...row.contexts], runtime: { status: "SUCCESS", retainedDetectionCount: row.detections.length, detections: [...row.detections].map((d) => ({ nativeClass: d.nativeClass, confidence: d.confidence, box: [...d.box] })), exposedSignal: row.detections.some((d) => exposed.includes(d.nativeClass)), coveredSignal: row.detections.some((d) => covered.includes(d.nativeClass)) } }));
  const semanticPayload: Record<string, unknown> = { schemaVersion: "STHN_I4_G8A_R1_SEMANTIC_EVIDENCE_V1", recoveryLineage: "CURRENT_AVAILABLE_G8A_EVIDENCE_NOT_MISSING_ORIGINAL", corpusAuthority: report.developmentCorpus, modelRuntimeAuthority: { g7Sha256: report.g7Sha256, g1Sha256: report.g1Sha256, g1PolicyFingerprint: g1.policyFingerprint, nudenet320nSha256: report.modelSha256 }, detectorGrouping: report.semanticGrouping, candidates: orderedRows, aggregates: { execution: { total: 558, successful: 558, failed: 0 }, overall: aggregate, byClassification: report.byClassification, byCategory: report.byCategory, byContext: report.byContext }, crossCorpusAuthorityBoundary: report.crossCorpusAuthorityBoundary, conclusions: { transparentClothing: report.transparentClothing, specialistRole: report.specialistRole, suggestivePresentationSpecialistStillRequired: report.suggestivePresentationSpecialistStillRequired, prohibitions: report.prohibitions } };
  return { report, rows, byteHashes, semanticPayload, semanticFingerprint: sha256(canonicalJson(semanticPayload)) };
};
