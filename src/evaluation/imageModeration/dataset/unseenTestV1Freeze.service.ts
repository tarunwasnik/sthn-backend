import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { UnseenCandidate, UnseenManifest } from "./unseenTestV1Intake.service";
import { UnseenReview, UnseenReviewManifest, unseenProgress, unseenReviewTaxonomy } from "./unseenTestV1Review.service";

export const F3_SCHEMA = "STHN_I4_F3_UNSEEN_TEST_V1_FROZEN_CORPUS_V1" as const;
export const F3_FILENAME = "frozen-unseen-corpus.json" as const;
export const F1_PROTOCOL_SHA256 = "68249ecc9e00919a3dfedb88b468ff5aff1e2858b1f1a0c9a28e46fec0d68138";
export const E5O_BEST_HEAD_SHA256 = "df76eec9c0c53dcd265f62fbedb9fe107d3fb754ba4a09ed71fd34743400b33d";
export const OWEN_ONNX_SHA256 = "8c28c49d9075f3ad15ebdc2961f02d5b3f99be944815b848b49c9f0e6f3fb689";
export const EXPECTED_REVIEW_FINGERPRINT = "320c679cf28f10ad82446e982a2d9afc38941f0352fb8e20f2b6493a0f6d92ec";
export type FreezeContract = { canonical: number; sourceOccurrences: number; pass: number; block: number; reviewFingerprint: string };
export const F3_CONTRACT: FreezeContract = { canonical: 325, sourceOccurrences: 327, pass: 156, block: 169, reviewFingerprint: EXPECTED_REVIEW_FINGERPRINT };

type Decision = "PASS" | "BLOCK";
export type FrozenCandidate = { candidateId: string; sha256: string; decision: Decision; classification: string; categories: string[]; contexts: string[]; difficulty?: "CONTEXTUAL" | "ADVERSARIAL" };
export type FrozenCorpusArtifact = {
  schemaVersion: typeof F3_SCHEMA; status: "AUTHORITATIVE_HUMAN_CORPUS_FROZEN_PRE_INFERENCE"; protocol: { schemaVersion: "STHN_I4_F1_UNSEEN_EVALUATION_PROTOCOL_V1"; sha256: string; noPostTestTuningRule: string };
  futureModelIdentities: { e5oBestHeadSha256: string; originalOwenOnnxSha256: string };
  counts: { canonical: number; sourceOccurrences: number; jpeg: number; avif: number; pass: number; block: number; classification: Record<string, number>; categories: Record<string, number>; contexts: Record<string, number>; difficulty: Record<string, number> };
  leakage: { invalid: number; exactV1Collisions: number; perceptualEvidencePairs: number; candidatesWithPerceptualEvidence: number; unresolvedLeakage: number };
  reviewFingerprint: string; candidateSetFingerprint: string; candidates: FrozenCandidate[]; frozenCorpusFingerprint: string;
};

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const assetHash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const sortedCounts = (values: string[]) => Object.fromEntries([...new Set(values)].sort().map(value => [value, values.filter(item => item === value).length]));
const candidateSet = (manifest: UnseenManifest) => manifest.candidates.map(candidate => ({ candidateId: candidate.candidateId, sha256: candidate.sha256 })).sort((a, b) => a.candidateId.localeCompare(b.candidateId));
export const candidateSetFingerprint = (manifest: UnseenManifest) => hash(candidateSet(manifest));
export const frozenCorpusPath = (root: string) => path.join(root, F3_FILENAME);
const allReviews = (manifest: UnseenManifest, reviews: UnseenReviewManifest) => manifest.candidates.map(candidate => reviews.reviews.find(review => review.candidateId === candidate.candidateId)).filter((review): review is UnseenReview => !!review);
const assertReview = (candidate: UnseenCandidate, review: UnseenReview) => {
  if (review.state !== "APPROVED" || (review.expectedDecision !== "PASS" && review.expectedDecision !== "BLOCK") || !review.classification || !review.contextTags?.length) throw Error(`Incomplete approved review: ${candidate.candidateId}`);
  if (!unseenReviewTaxonomy.classifications[review.expectedDecision].includes(review.classification as never)) throw Error(`Decision-incompatible classification: ${candidate.candidateId}`);
  if (review.categories?.some(category => !unseenReviewTaxonomy.categories.includes(category as never)) || review.contextTags.some(context => !unseenReviewTaxonomy.contexts.includes(context as never))) throw Error(`Invalid review taxonomy: ${candidate.candidateId}`);
  if (review.expectedDecision === "PASS" && review.categories?.length) throw Error(`PASS categories present: ${candidate.candidateId}`);
  if (review.expectedDecision === "BLOCK" && !review.categories?.length) throw Error(`BLOCK categories absent: ${candidate.candidateId}`);
  if (review.difficulty && review.difficulty !== "CONTEXTUAL" && review.difficulty !== "ADVERSARIAL") throw Error(`Invalid difficulty: ${candidate.candidateId}`);
  if (review.difficulty && !review.rationale?.trim()) throw Error(`Difficulty rationale absent: ${candidate.candidateId}`);
};
const unresolvedLeakage = (manifest: UnseenManifest, reviews: UnseenReviewManifest) => manifest.candidates.filter(candidate => candidate.exactDevelopmentLeakage.length || candidate.nearDevelopmentEvidence.length || !reviews.reviews.find(review => review.candidateId === candidate.candidateId)).length;
const assertAssets = async (root: string, manifest: UnseenManifest) => { for (const candidate of manifest.candidates) { const asset = path.resolve(root, candidate.relativeAsset); if (!asset.startsWith(path.resolve(root) + path.sep) || assetHash(await readFile(asset)) !== candidate.sha256) throw Error(`Candidate byte SHA-256 mismatch: ${candidate.candidateId}`); } };
const f1ProtocolPath = (root: string) => path.resolve(root, "..", "owen-elliott-image-safety-classifier-xs", "f1-unseen-evaluation-protocol.json");
const assertF1 = async (root: string, protocolPath = f1ProtocolPath(root)) => { const record = JSON.parse(await readFile(protocolPath, "utf8")) as { protocolSha256?: string }; if (record.protocolSha256 !== F1_PROTOCOL_SHA256) throw Error("I4-F1 protocol SHA-256 mismatch"); };
export type FreezeBuildOptions = { contract?: FreezeContract; protocolPath?: string };
export const buildFrozenCorpus = async (root: string, manifest: UnseenManifest, reviews: UnseenReviewManifest, options: FreezeBuildOptions = {}): Promise<FrozenCorpusArtifact> => {
  const contract = options.contract ?? F3_CONTRACT; await assertF1(root, options.protocolPath); await assertAssets(root, manifest);
  const progress = unseenProgress(manifest, reviews), occurrences = manifest.candidates.flatMap(candidate => candidate.occurrences.map(() => candidate)), approved = allReviews(manifest, reviews);
  const exactV1Collisions = manifest.candidates.filter(candidate => candidate.exactDevelopmentLeakage.length).length, perceptualEvidencePairs = manifest.candidates.reduce((total, candidate) => total + candidate.nearDevelopmentEvidence.length, 0), candidatesWithPerceptualEvidence = manifest.candidates.filter(candidate => candidate.nearDevelopmentEvidence.length).length, unresolved = unresolvedLeakage(manifest, reviews);
  if (manifest.candidates.length !== contract.canonical || progress.sourceOccurrences !== contract.sourceOccurrences || approved.length !== contract.canonical || progress.reviewRequired || progress.draft || progress.excluded || progress.pass !== contract.pass || progress.block !== contract.block || progress.pass + progress.block !== contract.canonical || manifest.invalid.length || exactV1Collisions || perceptualEvidencePairs || candidatesWithPerceptualEvidence || unresolved || reviews.fingerprint !== contract.reviewFingerprint) throw Error("F3 freeze preconditions failed");
  for (const candidate of manifest.candidates) assertReview(candidate, reviews.reviews.find(review => review.candidateId === candidate.candidateId)!);
  const candidates = manifest.candidates.map(candidate => { const review = reviews.reviews.find(item => item.candidateId === candidate.candidateId)!; return { candidateId: candidate.candidateId, sha256: candidate.sha256, decision: review.expectedDecision as Decision, classification: review.classification!, categories: [...(review.categories ?? [])].sort(), contexts: [...review.contextTags!].sort(), ...(review.difficulty ? { difficulty: review.difficulty } : {}) }; }).sort((a, b) => a.candidateId.localeCompare(b.candidateId));
  const counts = { canonical: manifest.candidates.length, sourceOccurrences: progress.sourceOccurrences, jpeg: occurrences.filter(candidate => ["jpg", "jpeg"].includes(candidate.extension)).length, avif: occurrences.filter(candidate => candidate.extension === "avif").length, pass: progress.pass, block: progress.block, classification: sortedCounts(candidates.map(candidate => candidate.classification)), categories: sortedCounts(candidates.flatMap(candidate => candidate.categories)), contexts: sortedCounts(candidates.flatMap(candidate => candidate.contexts)), difficulty: { UNFLAGGED: candidates.filter(candidate => !candidate.difficulty).length, CONTEXTUAL: candidates.filter(candidate => candidate.difficulty === "CONTEXTUAL").length, ADVERSARIAL: candidates.filter(candidate => candidate.difficulty === "ADVERSARIAL").length } };
  const leakage = { invalid: manifest.invalid.length, exactV1Collisions, perceptualEvidencePairs, candidatesWithPerceptualEvidence, unresolvedLeakage: unresolved }, protocol = { schemaVersion: "STHN_I4_F1_UNSEEN_EVALUATION_PROTOCOL_V1" as const, sha256: F1_PROTOCOL_SHA256, noPostTestTuningRule: "After Original Owen or E5O inference, this corpus is consumed as unseen evidence; later tuning, retraining, model selection, architecture adaptation, or policy optimization based on its results requires a new independently sourced unseen corpus for unbiased final evaluation." }, futureModelIdentities = { e5oBestHeadSha256: E5O_BEST_HEAD_SHA256, originalOwenOnnxSha256: OWEN_ONNX_SHA256 }, base = { schemaVersion: F3_SCHEMA, status: "AUTHORITATIVE_HUMAN_CORPUS_FROZEN_PRE_INFERENCE" as const, protocol, futureModelIdentities, counts, leakage, reviewFingerprint: reviews.fingerprint, candidateSetFingerprint: candidateSetFingerprint(manifest), candidates };
  return { ...base, frozenCorpusFingerprint: hash(base) };
};
export const createFrozenCorpus = async (root: string, manifest: UnseenManifest, reviews: UnseenReviewManifest, options: FreezeBuildOptions = {}) => { const artifact = await buildFrozenCorpus(root, manifest, reviews, options), target = frozenCorpusPath(root); await mkdir(root, { recursive: true }); await writeFile(target, JSON.stringify(artifact, null, 2) + "\n", { flag: "wx" }); return { artifact, path: target, sha256: assetHash(await readFile(target)) }; };
export const verifyFrozenCorpus = async (root: string, manifest: UnseenManifest, reviews: UnseenReviewManifest, options: FreezeBuildOptions = {}) => { const target = frozenCorpusPath(root), stored = JSON.parse(await readFile(target, "utf8")) as FrozenCorpusArtifact, rebuilt = await buildFrozenCorpus(root, manifest, reviews, options); const { frozenCorpusFingerprint: ignored, ...storedBase } = stored; if (stored.schemaVersion !== F3_SCHEMA || stored.candidateSetFingerprint !== candidateSetFingerprint(manifest) || stored.reviewFingerprint !== reviews.fingerprint || stored.frozenCorpusFingerprint !== hash(storedBase) || stored.frozenCorpusFingerprint !== rebuilt.frozenCorpusFingerprint || JSON.stringify(stored) !== JSON.stringify(rebuilt)) throw Error("Frozen unseen corpus verification failed"); return { artifact: stored, path: target, sha256: assetHash(await readFile(target)) }; };
