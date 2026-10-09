import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { loadManualBenchmarkManifest, manualBenchmarkRoot } from "../../evaluation/imageModeration/dataset/manualBenchmarkInventory.service";
import { analyzeManualBenchmark } from "../../evaluation/imageModeration/dataset/manualBenchmarkReport.service";
import { loadLocalReviewManifest } from "../../evaluation/imageModeration/dataset/sexualContentReview.service";

const candidateFingerprint = "c38c21141d65e25b2a0dbf5c1fc90847a3920f8fe4dfe437a9cc9cdf2deb5c5b";
const fixtureIdentity = "71f6d79fe1a0249d7085029f37211da4573a746378818f826da3e21afc0fb42f";
const splitFingerprint = "de209dc412f3272c06eaecd2314d882f45c7c3fdfddb1e70a48e68f1bdaa98d2";
const splitPath = path.resolve(process.cwd(), "evaluation-cache", "image-moderation", "owen-elliott-image-safety-classifier-xs", "e3o-development-split.json");

type Assignment = { id: string; sha256: string; decision: "PASS" | "BLOCK"; component: string; split: "TRAIN" | "VALIDATION" };
type SplitAuthority = { seed: number; algorithm: string; candidateFingerprint: string; fixtureIdentity: string; splitFingerprint: string; assignments: Assignment[]; summary: Record<string, any> };

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const rank = (seed: number, id: string) => Number.parseInt(hash(`${seed}:${id}`).slice(0, 12), 16);
async function readSplit(): Promise<SplitAuthority> { return JSON.parse(await readFile(splitPath, "utf8")) as SplitAuthority; }

test("E3O frozen V1 authority and recorded-only split are intact", async () => {
  const root = manualBenchmarkRoot();
  const [manifest, reviews, split] = await Promise.all([loadManualBenchmarkManifest(root), loadLocalReviewManifest(root), readSplit()]);
  const candidates = manifest.candidates.filter((candidate) => candidate.state === "REVIEW_REQUIRED").sort((left, right) => left.id.localeCompare(right.id));
  assert.equal(candidates.length, 558);
  assert.equal(hash(candidates.map((candidate) => [candidate.id, candidate.sha256])), candidateFingerprint);
  assert.equal(analyzeManualBenchmark(manifest, reviews).officialFixtureSetIdentity, fixtureIdentity);
  assert.equal(reviews.reviews.filter((review) => review.state === "APPROVED" && review.expectedDecision === "PASS").length, 260);
  assert.equal(reviews.reviews.filter((review) => review.state === "APPROVED" && review.expectedDecision === "BLOCK").length, 298);
  assert.deepEqual([split.seed, split.algorithm, split.candidateFingerprint, split.fixtureIdentity, split.splitFingerprint], [104729, "RECORDED_SHA_COMPONENT_STRATIFIED_HASH_V1", candidateFingerprint, fixtureIdentity, splitFingerprint]);
  assert.deepEqual([split.summary.train, split.summary.validation, split.summary.trainDecision.PASS, split.summary.trainDecision.BLOCK, split.summary.validationDecision.PASS, split.summary.validationDecision.BLOCK], [446, 112, 208, 238, 52, 60]);
  assert.deepEqual([split.summary.components, split.summary.singletons, split.summary.multiCandidateComponents, split.summary.largestComponent], [558, 558, 0, 1]);
  assert.deepEqual(split.summary.category, { TRAIN: { NUDITY: 83, PORNOGRAPHY: 29, SEXUAL_CONTENT: 30, SUGGESTIVE: 145 }, VALIDATION: { NUDITY: 23, PORNOGRAPHY: 10, SEXUAL_CONTENT: 10, SUGGESTIVE: 33 } });
  assert.equal(split.summary.classification.VALIDATION.PROFESSIONAL_PORTRAIT_PASS, 0);
  assert.equal(Object.prototype.hasOwnProperty.call(split.summary.classification.VALIDATION, "PROFESSIONAL_PORTRAIT_PASS"), true);
});

test("E3O assignments are complete, component-isolated, and reproducible in memory", async () => {
  const split = await readSplit();
  assert.equal(split.assignments.length, 558);
  assert.equal(new Set(split.assignments.map((assignment) => assignment.id)).size, 558);
  const splitsByComponent = new Map<string, Set<string>>();
  for (const assignment of split.assignments) {
    const splits = splitsByComponent.get(assignment.component) ?? new Set<string>();
    splits.add(assignment.split);
    splitsByComponent.set(assignment.component, splits);
  }
  assert.equal(splitsByComponent.size, 558);
  assert.ok([...splitsByComponent.values()].every((splits) => splits.size === 1));
  const validation = new Set<string>();
  for (const decision of ["PASS", "BLOCK"] as const) {
    const rows = split.assignments.filter((assignment) => assignment.decision === decision).sort((left, right) => rank(split.seed, left.id) - rank(split.seed, right.id));
    for (const row of rows.slice(0, Math.round(rows.length * 0.2))) validation.add(row.id);
  }
  assert.deepEqual(split.assignments.map((assignment) => assignment.split), split.assignments.map((assignment) => validation.has(assignment.id) ? "VALIDATION" : "TRAIN"));
  const unsignedAuthority = { ...split } as Partial<SplitAuthority>;
  delete unsignedAuthority.splitFingerprint;
  assert.equal(hash(unsignedAuthority), splitFingerprint);
});

test("historical Owen disagreements resolve exactly once to the frozen split", async () => {
  const split = await readSplit();
  const historical = JSON.parse(await readFile(path.resolve(process.cwd(), "evaluation-output", "image-moderation", "i4-b1-owen-elliott-xs", "latest.json"), "utf8")) as { rows: Array<{ candidateId: string; expectedDecision: string; actualDecision: string }> };
  const assignments = new Map(split.assignments.map((assignment) => [assignment.id, assignment]));
  let fpTrain = 0, fpValidation = 0, fnTrain = 0, fnValidation = 0;
  for (const row of historical.rows) {
    const assignment = assignments.get(row.candidateId);
    assert.ok(assignment, `unresolved historical candidate ${row.candidateId}`);
    if (row.expectedDecision === "PASS" && row.actualDecision === "BLOCK") assignment.split === "TRAIN" ? fpTrain++ : fpValidation++;
    if (row.expectedDecision === "BLOCK" && row.actualDecision === "PASS") assignment.split === "TRAIN" ? fnTrain++ : fnValidation++;
  }
  assert.deepEqual([fpTrain, fpValidation, fpTrain + fpValidation], [38, 9, 47]);
  assert.deepEqual([fnTrain, fnValidation, fnTrain + fnValidation], [41, 9, 50]);
});

test("E3O synthetic smoke remains frozen-backbone and head-only", async () => {
  const smoke = await readFile(path.resolve(process.cwd(), "evaluation-cache", "image-moderation", "owen-elliott-image-safety-classifier-xs", "e3o-smoke.py"), "utf8");
  assert.match(smoke, /backbone\.load_state_dict\(load_file\(/);
  assert.match(smoke, /for p in backbone\.parameters\(\):p\.requires_grad=False/);
  assert.match(smoke, /torch\.nn\.Linear\(220,2\)/);
  assert.match(smoke, /backbone\.forward_features\(x\)/);
  assert.match(smoke, /backbone\.forward_head\(features,pre_logits=True\)/);
  assert.match(smoke, /pre\.shape==\(2,220\).*out\.shape==\(2,2\).*==442/s);
  assert.doesNotMatch(smoke, /HOLDOUT|torch\.optim|\.backward\(|\.step\(/i);
  assert.match(smoke, /'optimizerCreated':False,'backwardCalled':False,'v1ImagesUsed':0/);
});
