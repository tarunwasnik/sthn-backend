import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { canonicalJson } from "../../research/textModerationDataset/manifest";
import { MhsInternalTestFreezeArtifact } from "../../research/textModerationDataset/mhsInternalTestFreeze";
import {
  MHS_DEVELOPMENT_PROJECTION_MANIFEST_PAYLOAD_DIGEST,
  MHS_DEVELOPMENT_PROJECTION_MANIFEST_SHA256,
  MHS_DEVELOPMENT_PROJECTION_PAYLOAD_DIGEST,
  MHS_DEVELOPMENT_PROJECTION_SHA256,
  MHS_LABEL_ENCODING,
  MHS_MATERIALIZATION_MANIFEST_FILENAME,
  MHS_MATERIALIZATION_MANIFEST_PAYLOAD_DIGEST,
  MHS_MATERIALIZATION_MANIFEST_SCHEMA,
  MHS_MATERIALIZATION_MANIFEST_SHA256,
  MHS_MATERIALIZATION_VERSION,
  MHS_MATERIALIZED_RECORD_SCHEMA,
  MHS_TRAIN_FILENAME,
  MHS_TRAIN_SHA256,
  MHS_VALIDATION_FILENAME,
  MHS_VALIDATION_SHA256,
  MhsMaterializedRow,
  createMhsMaterialization,
  extractMhsModelExample,
  loadMhsTrainingExamples,
  loadMhsTrainingRows,
  loadMhsValidationExamples,
  loadMhsValidationRows,
  validateMhsMaterializationManifest,
} from "../../research/textModerationDataset/mhsMaterialization";
import { MhsDevelopmentProjectionRow } from "../../research/textModerationDataset/mhsDevelopmentProjection";

const root=path.resolve(process.cwd(),"dataset-research","text-moderation","MEASURING_HATE_SPEECH"),development=path.join(root,"development"),splits=path.join(root,"splits"),release=path.join(root,"release"),materialized=path.join(root,"materialized");
const paths={projectionPath:path.join(development,"mhs-development-text-projection-v1.jsonl"),projectionManifestPath:path.join(development,"mhs-development-text-projection-manifest-v1.json"),splitManifestPath:path.join(splits,"mhs-split-manifest-v1.json"),internalTestFreezePath:path.join(splits,"mhs-internal-test-freeze-v1.json"),releaseManifestPath:path.join(release,"mhs-release-manifest-v1.json"),eligibilityManifestPath:path.join(release,"mhs-training-eligibility-manifest-v1.json")};
const trainPath=path.join(materialized,MHS_TRAIN_FILENAME),validationPath=path.join(materialized,MHS_VALIDATION_FILENAME),manifestPath=path.join(materialized,MHS_MATERIALIZATION_MANIFEST_FILENAME);
const sha=(p:string)=>crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex"),parse=<T>(p:string):T[]=>fs.readFileSync(p,"utf8").trimEnd().split("\n").map(line=>JSON.parse(line)),clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v)),temporary=()=>fs.mkdtempSync(path.join(os.tmpdir(),"sthn-mhs-7a-")),clean=(d:string)=>fs.rmSync(d,{recursive:true,force:true}),changed=(d:string,p:string)=>{const target=path.join(d,path.basename(p));fs.writeFileSync(target,`${fs.readFileSync(p,"utf8")} `);return target;};
const distribution=(rows:readonly MhsMaterializedRow[],key:"decision"|"primaryCategory")=>Object.fromEntries([...new Set(rows.map(row=>row[key]))].sort().map(value=>[value,rows.filter(row=>row[key]===value).length]));

test("T6L-7A immutable materialization and loader certification",async t=>{
  const projection=parse<MhsDevelopmentProjectionRow>(paths.projectionPath),train=parse<MhsMaterializedRow>(trainPath),validation=parse<MhsMaterializedRow>(validationPath),all=[...train,...validation],manifest=JSON.parse(fs.readFileSync(manifestPath,"utf8")),freeze=JSON.parse(fs.readFileSync(paths.internalTestFreezePath,"utf8")) as MhsInternalTestFreezeArtifact,protectedIds=new Set(freeze.protectedCandidateIds),projectionById=new Map(projection.map(row=>[row.exampleId,row]));
  await t.test("01 projection hash frozen",()=>assert.equal(sha(paths.projectionPath),MHS_DEVELOPMENT_PROJECTION_SHA256));
  await t.test("02 projection payload frozen",()=>assert.equal(manifest.authorities.projectionPayloadDigest,MHS_DEVELOPMENT_PROJECTION_PAYLOAD_DIGEST));
  await t.test("03 projection manifest hash frozen",()=>assert.equal(sha(paths.projectionManifestPath),MHS_DEVELOPMENT_PROJECTION_MANIFEST_SHA256));
  await t.test("04 projection manifest payload frozen",()=>assert.equal(manifest.authorities.projectionManifestPayloadDigest,MHS_DEVELOPMENT_PROJECTION_MANIFEST_PAYLOAD_DIGEST));
  await t.test("05 materialization manifest schema",()=>assert.equal(manifest.schemaVersion,MHS_MATERIALIZATION_MANIFEST_SCHEMA));
  await t.test("06 materialization version",()=>assert.equal(manifest.materializationVersion,MHS_MATERIALIZATION_VERSION));
  await t.test("07 manifest hash pinned",()=>assert.equal(sha(manifestPath),MHS_MATERIALIZATION_MANIFEST_SHA256));
  await t.test("08 manifest payload pinned",()=>assert.equal(manifest.manifestPayloadDigest,MHS_MATERIALIZATION_MANIFEST_PAYLOAD_DIGEST));
  await t.test("09 manifest validates",()=>assert.doesNotThrow(()=>validateMhsMaterializationManifest(manifest)));
  await t.test("10 TRAIN hash pinned",()=>assert.equal(sha(trainPath),MHS_TRAIN_SHA256));
  await t.test("11 VALIDATION hash pinned",()=>assert.equal(sha(validationPath),MHS_VALIDATION_SHA256));
  await t.test("12 TRAIN count 60",()=>assert.equal(train.length,60));
  await t.test("13 VALIDATION count 13",()=>assert.equal(validation.length,13));
  await t.test("14 total development count 73",()=>assert.equal(all.length,73));
  await t.test("15 unique IDs",()=>assert.equal(new Set(all.map(row=>row.exampleId)).size,73));
  await t.test("16 TRAIN membership",()=>assert.ok(train.every(row=>row.split==="TRAIN"&&row.developmentStatus==="TRAINING_ELIGIBLE")));
  await t.test("17 VALIDATION membership",()=>assert.ok(validation.every(row=>row.split==="VALIDATION"&&row.developmentStatus==="VALIDATION_AUTHORIZED")));
  await t.test("18 protected IDs excluded",()=>assert.ok(all.every(row=>!protectedIds.has(row.exampleId))));
  await t.test("19 materialized schema exact",()=>assert.ok(all.every(row=>row.schemaVersion===MHS_MATERIALIZED_RECORD_SCHEMA)));
  await t.test("20 dataset identity preserved",()=>assert.ok(all.every(row=>row.datasetVersion==="STHN_TEXT_MODERATION_DATASET_MHS_V1")));
  await t.test("21 release identity preserved",()=>assert.ok(all.every(row=>row.releaseVersion==="MHS_DATASET_RELEASE_V1")));
  await t.test("22 exact text preservation",()=>assert.ok(all.every(row=>row.text===projectionById.get(row.exampleId)?.text)));
  await t.test("23 exact decision preservation",()=>assert.ok(all.every(row=>row.decision===projectionById.get(row.exampleId)?.decision)));
  await t.test("24 exact primary category preservation",()=>assert.ok(all.every(row=>row.primaryCategory===projectionById.get(row.exampleId)?.primaryCategory)));
  await t.test("25 exact secondary category preservation",()=>assert.ok(all.every(row=>JSON.stringify(row.secondaryCategories)===JSON.stringify(projectionById.get(row.exampleId)?.secondaryCategories))));
  await t.test("26 exact reason preservation",()=>assert.ok(all.every(row=>row.reasonCode===projectionById.get(row.exampleId)?.reasonCode)));
  await t.test("27 exact language/script preservation",()=>assert.ok(all.every(row=>JSON.stringify([row.language,row.script])===JSON.stringify([projectionById.get(row.exampleId)?.language,projectionById.get(row.exampleId)?.script]))));
  await t.test("28 exact source provenance preservation",()=>assert.ok(all.every(row=>row.sourceRevision===projectionById.get(row.exampleId)?.sourceRevision&&row.sourceArtifactSha256===projectionById.get(row.exampleId)?.sourceArtifactSha256)));
  await t.test("29 label ALLOW zero",()=>assert.ok(all.filter(row=>row.decision==="ALLOW").every(row=>row.target===0)));
  await t.test("30 label BLOCK one",()=>assert.ok(all.filter(row=>row.decision==="BLOCK").every(row=>row.target===1)));
  await t.test("31 label contract frozen",()=>assert.deepEqual(manifest.labelEncoding,MHS_LABEL_ENCODING));
  await t.test("32 TRAIN ordered",()=>assert.deepEqual(train.map(row=>row.exampleId),train.map(row=>row.exampleId).sort()));
  await t.test("33 VALIDATION ordered",()=>assert.deepEqual(validation.map(row=>row.exampleId),validation.map(row=>row.exampleId).sort()));
  await t.test("34 TRAIN decisions",()=>assert.deepEqual(distribution(train,"decision"),{ALLOW:40,BLOCK:20}));
  await t.test("35 TRAIN categories",()=>assert.deepEqual(distribution(train,"primaryCategory"),{ABUSIVE_OR_HARASSING:6,HATE:4,PROFANITY:3,SEXUAL:7,null:40}));
  await t.test("36 VALIDATION decisions",()=>assert.deepEqual(distribution(validation,"decision"),{ALLOW:9,BLOCK:4}));
  await t.test("37 VALIDATION categories",()=>assert.deepEqual(distribution(validation,"primaryCategory"),{HATE:1,PROFANITY:1,SEXUAL:1,THREAT_OR_VIOLENCE:1,null:9}));
  await t.test("38 TRAIN loader certified",()=>assert.deepEqual(loadMhsTrainingRows(trainPath,manifestPath,paths),train));
  await t.test("39 VALIDATION loader certified",()=>assert.deepEqual(loadMhsValidationRows(validationPath,manifestPath,paths),validation));
  await t.test("40 TRAIN model examples count",()=>assert.equal(loadMhsTrainingExamples(trainPath,manifestPath,paths).length,60));
  await t.test("41 VALIDATION model examples count",()=>assert.equal(loadMhsValidationExamples(validationPath,manifestPath,paths).length,13));
  await t.test("42 model feature boundary",()=>assert.deepEqual(Object.keys(extractMhsModelExample(train[0])).sort(),["target","text"]));
  await t.test("43 model text exact",()=>assert.equal(extractMhsModelExample(train[0]).text,train[0].text));
  await t.test("44 no INTERNAL_TEST materialized",()=>assert.equal(manifest.protections.internalTestMaterialized,false));
  await t.test("45 no protected text access asserted",()=>assert.equal(manifest.protections.internalTestTextAccessed,false));
  await t.test("46 frozen 140 untouched asserted",()=>assert.equal(manifest.protections.frozen140Accessed,false));
  await t.test("47 no tokenization",()=>assert.equal(manifest.protections.tokenizationArtifactsCreated,false));
  await t.test("48 no training",()=>assert.equal(manifest.protections.trainingExecuted,false));
  await t.test("49 no evaluation",()=>assert.equal(manifest.protections.evaluationExecuted,false));
  await t.test("50 release is attribution authority",()=>assert.equal(manifest.provenance.releaseManifestIsAttributionAuthority,true));
  await t.test("51 CC BY obligations retained",()=>assert.deepEqual([manifest.provenance.license,manifest.provenance.attributionAndChangeNoticeRequired],["LICENSE.CC_BY_4_0",true]));
});

test("7A deterministic artifact replay",()=>{const a=temporary(),b=temporary();try{const generatedAt=JSON.parse(fs.readFileSync(manifestPath,"utf8")).generatedAt,x=createMhsMaterialization({...paths,outputDirectory:a,generatedAt}),y=createMhsMaterialization({...paths,outputDirectory:b,generatedAt});assert.deepEqual([fs.readFileSync(x.trainPath,"utf8"),fs.readFileSync(x.validationPath,"utf8"),fs.readFileSync(x.manifestPath,"utf8")],[fs.readFileSync(y.trainPath,"utf8"),fs.readFileSync(y.validationPath,"utf8"),fs.readFileSync(y.manifestPath,"utf8")]);}finally{clean(a);clean(b);}});
test("7A refuses overwrite",()=>{const d=temporary();try{createMhsMaterialization({...paths,outputDirectory:d,generatedAt:"2026-09-13T12:00:00.000Z"});assert.throws(()=>createMhsMaterialization({...paths,outputDirectory:d}),/overwrite refused/);}finally{clean(d);}});
test("7A publication failure rolls back all three files",()=>{const d=temporary();try{assert.throws(()=>createMhsMaterialization({...paths,outputDirectory:d,generatedAt:"2026-09-13T12:00:00.000Z",publishTriple:(tt,tp)=>{fs.renameSync(tt,tp);throw new Error("simulated");}}),/simulated/);assert.deepEqual(fs.readdirSync(d),[]);}finally{clean(d);}});
test("TRAIN loader rejects VALIDATION artifact",()=>assert.throws(()=>loadMhsTrainingRows(validationPath,manifestPath,paths),/Wrong materialized split artifact/));
test("VALIDATION loader rejects TRAIN artifact",()=>assert.throws(()=>loadMhsValidationRows(trainPath,manifestPath,paths),/Wrong materialized split artifact/));
test("loader rejects tampered materialized content before parsing",()=>{const d=temporary(),p=path.join(d,MHS_TRAIN_FILENAME);try{fs.copyFileSync(trainPath,p);fs.appendFileSync(p,"not-json\n");assert.throws(()=>loadMhsTrainingRows(p,manifestPath,paths),/SHA-256/);}finally{clean(d);}});
test("loader rejects protected-ID injection before parsed text exposure",()=>{const d=temporary(),p=path.join(d,MHS_TRAIN_FILENAME),rows=parse<MhsMaterializedRow>(trainPath),freeze=JSON.parse(fs.readFileSync(paths.internalTestFreezePath,"utf8")) as MhsInternalTestFreezeArtifact;try{(rows[0] as any).exampleId=freeze.protectedCandidateIds[0];fs.writeFileSync(p,`${rows.map(row=>JSON.stringify(row)).join("\n")}\n`);assert.throws(()=>loadMhsTrainingRows(p,manifestPath,paths),/SHA-256/);}finally{clean(d);}});
test("loader rejects unknown-ID injection",()=>{const d=temporary(),p=path.join(d,MHS_TRAIN_FILENAME),rows=parse<MhsMaterializedRow>(trainPath);try{(rows[0] as any).exampleId="src_unknown";fs.writeFileSync(p,`${rows.map(row=>JSON.stringify(row)).join("\n")}\n`);assert.throws(()=>loadMhsTrainingRows(p,manifestPath,paths),/SHA-256/);}finally{clean(d);}});
test("loader rejects duplicate injection",()=>{const d=temporary(),p=path.join(d,MHS_TRAIN_FILENAME),rows=parse<MhsMaterializedRow>(trainPath);try{rows[59]=rows[0];fs.writeFileSync(p,`${rows.map(row=>JSON.stringify(row)).join("\n")}\n`);assert.throws(()=>loadMhsTrainingRows(p,manifestPath,paths),/SHA-256/);}finally{clean(d);}});
test("loader rejects stale manifest",()=>{const d=temporary(),p=path.join(d,MHS_MATERIALIZATION_MANIFEST_FILENAME),manifest=clone(JSON.parse(fs.readFileSync(manifestPath,"utf8")));try{manifest.releaseVersion="OLD";fs.writeFileSync(p,canonicalJson(manifest));assert.throws(()=>loadMhsTrainingRows(trainPath,p,paths),/manifest SHA-256/);}finally{clean(d);}});
test("materializer source has no monolithic-candidate or frozen-fixture dependency",()=>{const source=["src/research/textModerationDataset/mhsMaterialization.ts","src/scripts/createMhsMaterialization.ts"].map(file=>fs.readFileSync(path.resolve(process.cwd(),file),"utf8")).join("\n");assert.doesNotMatch(source,/candidatePath|mhs-review-pilot-v1-candidate|MhsCandidateAdmission|textModerationFixtures|FROZEN_TEXT_MODERATION_FIXTURE|protectedFrozenBenchmarkContaminationDetector/);});
for(const [label,key] of [["projection","projectionPath"],["projection manifest","projectionManifestPath"],["P split","splitManifestPath"],["Q freeze","internalTestFreezePath"],["S release","releaseManifestPath"],["S eligibility","eligibilityManifestPath"]] as const)test(`7A rejects changed ${label} authority`,()=>{const d=temporary();try{assert.throws(()=>createMhsMaterialization({...paths,[key]:changed(d,paths[key]),outputDirectory:path.join(d,"out")}),/SHA-256/);}finally{clean(d);}});
