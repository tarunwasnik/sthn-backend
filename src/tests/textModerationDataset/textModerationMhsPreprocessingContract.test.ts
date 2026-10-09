import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { CLASSIFIER_BASE_ARTIFACTS, CLASSIFIER_BASE_AUTHORITY_FILENAME, CLASSIFIER_BASE_AUTHORITY_SHA256, CLASSIFIER_BASE_REPOSITORY, CLASSIFIER_BASE_REVISION } from "../../research/textModerationDataset/classifierBaseModelAuthority";
import { MHS_MATERIALIZATION_MANIFEST_FILENAME, MHS_MATERIALIZATION_MANIFEST_SHA256, MHS_TRAIN_FILENAME, MHS_TRAIN_SHA256, MHS_VALIDATION_FILENAME, MHS_VALIDATION_SHA256 } from "../../research/textModerationDataset/mhsMaterialization";
import { E5_SMALL_MODEL_REVISION } from "../../research/textModerationDataset/semanticSimilarity/e5SmallExportContract";
import { MHS_PREPROCESSING_ARTIFACT_SHA256, MHS_PREPROCESSING_FILENAME, MHS_PREPROCESSING_MAX_LENGTH, MHS_PREPROCESSING_PAYLOAD_DIGEST, MHS_PREPROCESSING_SCHEMA, MHS_PREPROCESSING_VERSION, createMhsPreprocessingContract, readMhsPreprocessingContract, validateMhsPreprocessingContract } from "../../research/textModerationDataset/mhsPreprocessingContract";

const backend=process.cwd(),mhs=path.resolve(backend,"dataset-research","text-moderation","MEASURING_HATE_SPEECH"),materialized=path.join(mhs,"materialized"),cache=path.resolve(backend,"evaluation-cache","text-moderation","classifier","facebookai-xlm-roberta-base",CLASSIFIER_BASE_REVISION),authorityPath=path.resolve(backend,"dataset-research","text-moderation","model-authority",CLASSIFIER_BASE_AUTHORITY_FILENAME),manifestPath=path.join(materialized,MHS_MATERIALIZATION_MANIFEST_FILENAME),trainPath=path.join(materialized,MHS_TRAIN_FILENAME),validationPath=path.join(materialized,MHS_VALIDATION_FILENAME),contractPath=path.join(mhs,"preprocessing",MHS_PREPROCESSING_FILENAME),sha=(file:string)=>crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"),contract=readMhsPreprocessingContract(contractPath),options=(outputDirectory:string)=>({classifierAuthorityPath:authorityPath,classifierCacheDirectory:cache,materializationManifestPath:manifestPath,trainPath,validationPath,outputDirectory,generatedAt:contract.generatedAt}),temporary=()=>fs.mkdtempSync(path.join(os.tmpdir(),"sthn-t6l-7b-"));

test("7B pins every upstream authority",async t=>{
  await t.test("01 classifier authority SHA enforced",()=>assert.equal(sha(authorityPath),CLASSIFIER_BASE_AUTHORITY_SHA256));
  await t.test("02 repository exact",()=>assert.equal(contract.classifier.repository,CLASSIFIER_BASE_REPOSITORY));
  await t.test("03 revision exact",()=>assert.equal(contract.classifier.revision,CLASSIFIER_BASE_REVISION));
  for(const [name,expected] of Object.entries(CLASSIFIER_BASE_ARTIFACTS))await t.test(`${name} size and SHA enforced`,()=>{const bytes=fs.readFileSync(path.join(cache,name));assert.equal(bytes.length,expected.byteSize);assert.equal(sha(path.join(cache,name)),expected.sha256);});
  await t.test("08 offline tokenizer load certified",()=>assert.equal(contract.tokenizerCertification.offlineOnly,true));
  await t.test("09 tokenizer class exact",()=>assert.equal(contract.classifier.tokenizerClass,"XLMRobertaTokenizerFast"));
  await t.test("10 tokenizer backend exact",()=>assert.equal(contract.classifier.tokenizerBackend,"HUGGING_FACE_TOKENIZERS_UNIGRAM_SENTENCEPIECE"));
  await t.test("11 vocabulary exact",()=>assert.equal(contract.classifier.tokenizerArtifacts["tokenizer.json"].sha256,CLASSIFIER_BASE_ARTIFACTS["tokenizer.json"].sha256));
  await t.test("12 special IDs exact",()=>assert.deepEqual(contract.specialTokens,{bos:{id:0,token:"<s>"},cls:{id:0,token:"<s>"},eos:{id:2,token:"</s>"},mask:{id:250001,token:"<mask>"},pad:{id:1,token:"<pad>"},sep:{id:2,token:"</s>"},unk:{id:3,token:"<unk>"}}));
  await t.test("13 model inputs exclude token types",()=>assert.deepEqual([contract.tensorContract.input_ids,contract.tensorContract.attention_mask,contract.tensorContract.token_type_ids],["int64[B,L]","int64[B,L]","ABSENT"]));
  await t.test("14 model maximum is 512",()=>assert.equal(contract.classifier.modelMaximumLength,512));
  await t.test("15 materialization manifest SHA enforced",()=>assert.equal(sha(manifestPath),MHS_MATERIALIZATION_MANIFEST_SHA256));
  await t.test("16 TRAIN SHA enforced",()=>assert.equal(sha(trainPath),MHS_TRAIN_SHA256));
  await t.test("17 VALIDATION SHA enforced",()=>assert.equal(sha(validationPath),MHS_VALIDATION_SHA256));
});

test("7B deterministic length analysis and max selection",async t=>{
  await t.test("18 TRAIN count",()=>assert.equal(contract.train.recordCount,60));
  await t.test("19 VALIDATION count",()=>assert.equal(contract.validation.recordCount,13));
  await t.test("20 all TRAIN preprocess",()=>assert.equal(contract.train.preprocessingPassed,true));
  await t.test("21 all VALIDATION preprocess",()=>assert.equal(contract.validation.preprocessingPassed,true));
  await t.test("22 TRAIN stats deterministic",()=>assert.deepEqual(contract.train.lengthStatistics,{count:60,min:6,max:128,mean:37.2,median:26,p75:54,p90:79.3,p95:99.35,p99:115.61,percentileMethod:"LINEAR_INTERPOLATION_R7"}));
  await t.test("23 VALIDATION stats deterministic",()=>assert.deepEqual(contract.validation.lengthStatistics,{count:13,min:8,max:98,mean:43.846154,median:39,p75:69,p90:87,p95:93.2,p99:97.04,percentileMethod:"LINEAR_INTERPOLATION_R7"}));
  const expected={64:[[11,18.333333,265,64],[4,30.769231,76,34]],128:[[0,0,0,0],[0,0,0,0]],256:[[0,0,0,0],[0,0,0,0]],512:[[0,0,0,0],[0,0,0,0]]} as const;
  for(const limit of [64,128,256,512] as const)await t.test(`${limit} analysis deterministic`,()=>{const values=[contract.train,contract.validation].map(split=>{const row=split.candidateLimits.find(item=>item.maxLength===limit)!;return[row.rowsExceeding,row.percentage,row.totalExcessTokens,row.maximumExcessTokens]});assert.deepEqual(values,expected[limit]);});
  await t.test("28 selected limit deterministic",()=>assert.equal(contract.preprocessing.authorizedMaxLength,MHS_PREPROCESSING_MAX_LENGTH));
  await t.test("29 chosen truncation count deterministic",()=>assert.deepEqual([contract.train.chosenLimitTruncation.count,contract.validation.chosenLimitTruncation.count],[0,0]));
  await t.test("30 dynamic padding deterministic",()=>assert.equal(contract.tokenizerCertification.deterministicFixedOrderBatch,true));
  await t.test("31 attention masks valid",()=>assert.equal(contract.tokenizerCertification.attentionMasksValid,true));
  await t.test("32 IDs in vocabulary",()=>assert.equal(contract.tokenizerCertification.idsWithinVocabulary,true));
  await t.test("33 repeated tokenization identical",()=>assert.equal(contract.tokenizerCertification.deterministicRepeatedEncoding,true));
});

test("7B feature, label, and boundary contracts",async t=>{
  await t.test("34 ALLOW target zero",()=>assert.equal(contract.labels.label2id.ALLOW,0));
  await t.test("35 BLOCK target one",()=>assert.equal(contract.labels.label2id.BLOCK,1));
  await t.test("36 input extractor exposes text only",()=>assert.deepEqual(contract.preprocessing.featureInput,["text"]));
  await t.test("37 metadata excluded from tokenizer inputs",()=>assert.deepEqual(Object.keys(contract.preprocessing).includes("metadata"),false));
  await t.test("38 no persistent tokenized dataset",()=>assert.equal(contract.preprocessing.persistentTokenizedDataset,false));
  await t.test("39 only TRAIN and VALIDATION are text sources",()=>assert.deepEqual(contract.protectedDataExclusion.sourceFiles,[MHS_TRAIN_FILENAME,MHS_VALIDATION_FILENAME]));
  await t.test("40 projection and monolithic candidate unopened",()=>assert.deepEqual([contract.protectedDataExclusion.developmentProjectionOpened,contract.protectedDataExclusion.monolithicCandidateOpened],[false,false]));
  await t.test("41 INTERNAL_TEST and frozen 140 untouched",()=>assert.deepEqual([contract.protectedDataExclusion.internalTestAccessed,contract.protectedDataExclusion.frozen140Accessed],[false,false]));
  await t.test("42 E5 authority unchanged",()=>{const file=path.resolve(backend,"evaluation-cache","text-moderation","semantic","intfloat-multilingual-e5-small",E5_SMALL_MODEL_REVISION,"STHN_E5_SMALL_ONNX_EXPORT_MANIFEST.json");assert.equal(sha(file),"af28451d28ca3de53d914988536a2ad97ff13b1b03766dd1bfe798ec7671ae12");});
  await t.test("43 no E5 tokenizer used",()=>assert.equal(contract.protectedDataExclusion.e5Used,false));
  await t.test("44 7B downloaded no weights; later authorized weight is isolated",()=>{assert.equal(contract.protectedDataExclusion.classifierWeightsDownloaded,false);assert.deepEqual(fs.readdirSync(cache,{withFileTypes:true}).filter(e=>e.isFile()&&/\.(bin|safetensors|onnx|pt|pth)$/i.test(e.name)).map(e=>e.name),["model.safetensors"]);});
  await t.test("45 no optimizer, backward, training, or evaluation",()=>assert.equal(Object.values(contract.executionBoundaries).some(Boolean),false));
  await t.test("46 implementation has no protected reader or training call",()=>{const source=fs.readFileSync(path.resolve(backend,"src/research/textModerationDataset/mhsPreprocessingContract.ts"),"utf8");assert.doesNotMatch(source,/from\s+["'][^"']*(mhsDevelopmentProjection|mhsInternalTestFreeze|textModerationFixtures|mhsCandidate)/);assert.doesNotMatch(source,/new\s+\w*Optimizer|backward\s*\(|\.train\s*\(/);});
});

test("7B artifact is canonical, immutable, and transaction-safe",async t=>{
  await t.test("47 schema and version exact",()=>assert.deepEqual([contract.schemaVersion,contract.contractVersion],[MHS_PREPROCESSING_SCHEMA,MHS_PREPROCESSING_VERSION]));
  await t.test("48 artifact SHA and payload digest exact",()=>{assert.equal(sha(contractPath),MHS_PREPROCESSING_ARTIFACT_SHA256);assert.equal(contract.contractPayloadDigest,MHS_PREPROCESSING_PAYLOAD_DIGEST);assert.doesNotThrow(()=>validateMhsPreprocessingContract(contract));});
  await t.test("49 deterministic replay",async()=>{const a=temporary(),b=temporary();try{const x=await createMhsPreprocessingContract(options(a)),y=await createMhsPreprocessingContract(options(b));assert.deepEqual(fs.readFileSync(x.artifactPath),fs.readFileSync(y.artifactPath));}finally{fs.rmSync(a,{recursive:true,force:true});fs.rmSync(b,{recursive:true,force:true});}});
  await t.test("50 overwrite refused",async()=>{const d=temporary();try{await createMhsPreprocessingContract(options(d));await assert.rejects(createMhsPreprocessingContract(options(d)),/overwrite refused/);}finally{fs.rmSync(d,{recursive:true,force:true});}});
  await t.test("51 publication failure leaves no artifact",async()=>{const d=temporary();try{await assert.rejects(createMhsPreprocessingContract({...options(d),publish:()=>{throw new Error("simulated");}}),/simulated/);assert.deepEqual(fs.readdirSync(d),[]);}finally{fs.rmSync(d,{recursive:true,force:true});}});
  await t.test("52 tampered contract fails closed",()=>{const d=temporary(),file=path.join(d,MHS_PREPROCESSING_FILENAME);try{fs.copyFileSync(contractPath,file);fs.appendFileSync(file," ");assert.throws(()=>readMhsPreprocessingContract(file),/artifact SHA-256/);}finally{fs.rmSync(d,{recursive:true,force:true});}});
});
