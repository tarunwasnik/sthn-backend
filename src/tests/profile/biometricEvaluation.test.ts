import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateOffline } from "../../research/biometricEvaluation/evaluate";
import { validateManifest } from "../../research/biometricEvaluation/manifest";

const cond = { device: "PHONE", lighting: "LOW", quality: "NORMAL" } as const;
const sample = (id: string, truth: "GENUINE" | "IMPOSTOR" | null, target = "USER") => ({
  id, target, split: "HOLDOUT", subject: `${id}_s`, referenceSubject: truth === "IMPOSTOR" ? `${id}_r` : `${id}_s`,
  referenceArtifact: `refs/${id}.jpg`, truth, captures: Array.from({ length: 5 }, (_, i) => ({ id: `${id}_${i}`, artifact: `captures/${id}_${i}.jpg` })), conditions: cond,
});
const manifest = () => ({ schemaVersion: "STHN_BIOMETRIC_EVAL_V1", datasetId: "synthetic", provenance: "synthetic metadata", authorizedUseBasis: "test", licenseConditions: "test", retention: { deleteBy: "2030-01-01", deletionRequirements: "delete fixtures" }, samples: [sample("a", "GENUINE"), sample("b", "IMPOSTOR", "CREATOR"), sample("c", null)], presentations: [
  { id: "p1", subject: "p1s", split: "HOLDOUT", truth: "ATTACK", instrument: "PRINT", artifact: "pad/p1.jpg", conditions: cond },
  { id: "p2", subject: "p2s", split: "HOLDOUT", truth: "ATTACK", instrument: "SCREEN", artifact: "pad/p2.jpg", conditions: cond },
  { id: "p3", subject: "p3s", split: "HOLDOUT", truth: "BONA_FIDE", instrument: null, artifact: "pad/p3.jpg", conditions: cond },
  { id: "p4", subject: "p4s", split: "HOLDOUT", truth: "BONA_FIDE", instrument: null, artifact: "pad/p4.jpg", conditions: cond },
  { id: "p5", subject: "p5s", split: "HOLDOUT", truth: "ATTACK", instrument: "PRINT", artifact: "pad/p5.jpg", conditions: cond },
] });
const scores = (values: number[]) => values.map(score => ({ status: "SCORED", score }));
const results = () => ({ samples: [
  { sampleId: "a", captures: scores([0.4,0.5,0.6,0.7,0.8]), enrollment: "ENROLLED", workflow: "REJECTED" },
  { sampleId: "b", captures: scores([0.1,0.2,0.5,0.7,0.8]), enrollment: "FAILURE", workflow: "ACCEPTED" },
  { sampleId: "c", captures: scores([0,0,0,0,0]), enrollment: "NOT_ATTEMPTED", workflow: "NOT_MEASURED" },
], presentations: [
  { presentationId: "p1", outcome: "BONA_FIDE" }, { presentationId: "p2", outcome: "ATTACK" },
  { presentationId: "p3", outcome: "ATTACK" }, { presentationId: "p4", outcome: "BONA_FIDE" },
  { presentationId: "p5", outcome: "NO_RESPONSE" },
] });
const run = (m: unknown = manifest(), r: unknown = results(), thresholds: unknown = [0.5,0.7]) => evaluateOffline(m, r, thresholds, "2026-11-19");

test("independent comparison and session FMR/FNMR include threshold equality", () => {
  const x = run().total.component;
  assert.deepEqual(x.tradeoffs.map(t => [t.fmr.value,t.fnmr.value]), [[1,0],[0,1]]);
  assert.deepEqual(x.individualComparisons.tradeoffs[0].fmr, { numerator: 3, denominator: 5, value: 0.6 });
  assert.deepEqual(x.individualComparisons.tradeoffs[0].fnmr, { numerator: 1, denominator: 5, value: 0.2 });
  assert.equal(x.genuine.median, 0.6); assert.equal(x.impostor.median, 0.5);
});
test("workflow metrics use measured attempts, with separate enrollment failure", () => {
  const x = run().total;
  assert.equal(x.workflow.far.value, 1); assert.equal(x.workflow.frr.value, 1);
  assert.deepEqual(x.acquisition.failureToEnroll, { numerator: 1, denominator: 2, value: 0.5 });
  assert.equal(x.counts.unlabeledSessions, 1);
});
test("PAD metrics count classified presentations and disclose no response", () => {
  const x = run().total.pad;
  assert.deepEqual(x.apcer, { numerator: 1, denominator: 2, value: 0.5 });
  assert.deepEqual(x.bpcer, { numerator: 1, denominator: 2, value: 0.5 });
  assert.equal(x.noResponse, 1); assert.equal(x.byInstrument.PRINT.value, 1);
  assert.equal(x.byInstrument.REPLAY.value, null);
});
test("technical and acquisition failures are separate and median needs three", () => {
  const r = results(); r.samples[0].captures = [{status:"ACQUISITION_FAILURE"}, {status:"TECHNICAL_FAILURE"}, ...scores([0.1,0.2,0.9])] as unknown as Array<{status:string;score:number}>;
  r.samples[1].captures = [{status:"QUALITY_FAILURE"},{status:"TECHNICAL_FAILURE"},{status:"TECHNICAL_FAILURE"},...scores([0.5,0.7])] as unknown as Array<{status:string;score:number}>;
  const x=run(manifest(),r).total;
  assert.equal(x.component.genuine.median,0.2); assert.equal(x.component.impostor.count,0);
  assert.equal(x.counts.insufficientScoredCaptures,1); assert.equal(x.counts.captureTechnicalFailures,3);
  assert.deepEqual(x.acquisition.failureToAcquire, {numerator:1,denominator:15,value:1/15});
});
test("empty and unavailable denominators are null, never fabricated zero", () => {
  const m=manifest(); m.samples=[]; m.presentations=[];
  const x=run(m,{samples:[],presentations:[]}).total;
  assert.equal(x.component.tradeoffs[0].fmr.value,null); assert.equal(x.workflow.far.value,null);
  assert.equal(x.acquisition.failureToAcquire.value,null); assert.equal(x.pad.apcer.value,null);
});
test("missing results and absent labels are explicit, not inferred", () => {
  const r=results(); r.samples=[]; r.presentations=[];
  const x=run(manifest(),r).total;
  assert.equal(x.counts.missingSessionResults,3); assert.equal(x.counts.unlabeledSessions,1);
  assert.equal(x.pad.notRun,5); assert.equal(x.workflow.measuredAttempts,0);
});
test("invalid scores, malformed outcomes and missing threshold fail safely", () => {
  for (const bad of [NaN, Infinity, -1.1, 1.01]) { const r=results(); r.samples[0].captures[0].score=bad; assert.throws(()=>run(manifest(),r),/INVALID_EVALUATION_INPUT/); }
  assert.throws(()=>run(manifest(),results(),[]),/INVALID_EVALUATION_INPUT/);
  assert.throws(()=>run(manifest(),results(),[NaN]),/INVALID_EVALUATION_INPUT/);
  const r=results(); r.samples[0].workflow="PASS"; assert.throws(()=>run(manifest(),r),/INVALID_EVALUATION_INPUT/);
});
test("duplicate, unknown and missing result references handled distinctly", () => {
  const r=results(); r.samples.push(r.samples[0]); assert.throws(()=>run(manifest(),r),/INVALID_RESULT_REFERENCE/);
  const other=results(); other.samples[0].sampleId="unknown"; assert.throws(()=>run(manifest(),other),/INVALID_RESULT_REFERENCE/);
});
test("manifest rejects invalid authorization metadata, truth, splits, duplicates and paths", () => {
  const invalid: unknown[] = [];
  let m=manifest(); m.authorizedUseBasis=""; invalid.push(m);
  m=manifest(); m.retention.deleteBy="2020-01-01"; invalid.push(m);
  m=manifest(); m.samples[0].referenceSubject="other"; invalid.push(m);
  m=manifest(); m.samples[1].subject=m.samples[0].subject; m.samples[1].split="DEVELOPMENT"; invalid.push(m);
  m=manifest(); m.samples[0].captures[1].artifact=m.samples[0].captures[0].artifact; invalid.push(m);
  m=manifest(); m.samples[0].referenceArtifact="../sensitive"; invalid.push(m);
  m=manifest(); m.samples[0].referenceArtifact="https://example.com/test"; invalid.push(m);
  m=manifest(); m.samples[0].referenceArtifact="C:/private"; invalid.push(m);
  for (const value of invalid) assert.throws(()=>validateManifest(value,"2026-11-19"));
  assert.throws(()=>validateManifest(manifest(),"2026-02-30"),/INVALID_MANIFEST/);
});
test("breakdowns include targets and controlled conditions", () => {
  const x=run(); assert.equal(x.breakdown.target.USER.counts.plannedSessions,2);
  assert.equal(x.breakdown.target.CREATOR.counts.plannedSessions,1);
  assert.equal(x.breakdown.lighting.LOW.counts.plannedSessions,3);
});
test("report and errors never contain identifiers, paths, free text or embeddings", () => {
  const m=manifest(); m.provenance="SECRET_PERSON"; m.samples[0].subject="SECRET_PERSON"; m.samples[0].referenceSubject="SECRET_PERSON";
  m.samples[0].referenceArtifact="private/SECRET_PERSON.jpg";
  const serialized=JSON.stringify(run(m));
  for (const secret of ["SECRET_PERSON","private/", "p1s", "synthetic metadata", "captures/"]) assert.equal(serialized.includes(secret),false);
  const bad={...m,extra:"SECRET_PERSON"}; assert.throws(()=>run(bad), e => e instanceof Error && !e.message.includes("SECRET_PERSON"));
});
test("explicit evaluation thresholds are independent of environment", () => {
  const before=process.env.STHN_SFACE_IDENTITY_APPROVAL_THRESHOLD;
  process.env.STHN_SFACE_IDENTITY_APPROVAL_THRESHOLD="0.99";
  try { assert.equal(run().total.component.tradeoffs[0].threshold,0.5); }
  finally { if (before === undefined) delete process.env.STHN_SFACE_IDENTITY_APPROVAL_THRESHOLD; else process.env.STHN_SFACE_IDENTITY_APPROVAL_THRESHOLD=before; }
});
test("review and inconclusive remain distinct from final decisions", () => {
  const r=results(); r.samples[0].workflow="REVIEW"; r.samples[1].workflow="INCONCLUSIVE";
  const w=run(manifest(),r).total.workflow;
  assert.equal(w.review.value,0.5); assert.equal(w.inconclusive.value,0.5);
  assert.equal(w.far.value,0); assert.equal(w.frr.value,0);
});
test("research import graph does not load model, database, workers or decisions", () => {
  const loaded=Object.keys(require.cache).map(name=>name.replace(/\\/g,"/"));
  assert.equal(loaded.some(name=>/\/mongoose\/|\/mongodb\/|profileVerificationJob\.service|profileVerificationAiDecision\.service|profileVerificationSFaceAdapter|onnxruntime-node/.test(name)),false);
});
