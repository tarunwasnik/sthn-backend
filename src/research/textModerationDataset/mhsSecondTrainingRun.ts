import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { CLASSIFIER_BASE_AUTHORITY_SHA256, CLASSIFIER_BASE_REPOSITORY, CLASSIFIER_BASE_REVISION } from "./classifierBaseModelAuthority";
import { MHS_MATERIALIZATION_MANIFEST_SHA256, MHS_TRAIN_SHA256, MHS_VALIDATION_SHA256 } from "./mhsMaterialization";
import { MHS_PREPROCESSING_ARTIFACT_SHA256 } from "./mhsPreprocessingContract";
import { MHS_BASE_WEIGHT_BYTES, MHS_BASE_WEIGHT_SHA256, MHS_FIRST_TRAINING_RUN_SHA256, TrainingFileRecord } from "./mhsFirstTrainingRun";
import { MHS_FIRST_RUN_ASSESSMENT_SHA256 } from "./mhsFirstRunValidationAssessment";
import { MHS_FIRST_TRAINING_SEED } from "./mhsFirstTrainingConfig";
import { MHS_SECOND_TRAINING_CONFIG_OUTPUT_ROOT, MHS_SECOND_TRAINING_CONFIG_SHA256 } from "./mhsSecondTrainingConfig";

export const MHS_SECOND_TRAINING_RUN_SCHEMA="STHN_TEXT_MODERATION_MHS_SECOND_TRAINING_RUN_V1" as const;
export const MHS_SECOND_TRAINING_RUN_VERSION="MHS_XLM_ROBERTA_SECOND_TRAINING_RUN_V1" as const;
export const MHS_SECOND_TRAINING_RUN_FILENAME="mhs-xlm-roberta-second-training-run-v1.json" as const;
export const MHS_SECOND_TRAINING_RUN_SHA256="a22d099d49e2299efe5aa77d89c876652a05454e7c3ed81f4beb5df2a0ac2f8a" as const;
export const MHS_SECOND_TRAINING_RUN_PAYLOAD_DIGEST="afa097b734926df26a500998f552b90a0a3b649d5d435f210d83cdda97635c20" as const;

export interface MhsSecondTrainingRun {
  readonly schemaVersion:string;readonly runVersion:string;readonly terminalStatus:string;readonly runCount:number;readonly runPayloadDigest:string;
  readonly authorities:Record<string,string>;readonly cleanInitialization:Record<string,unknown>;readonly toolchain:Record<string,string>;readonly hardware:Record<string,unknown>;readonly seed:number;
  readonly configuration:Record<string,unknown>;readonly steps:Record<string,number>;readonly epochs:readonly Record<string,unknown>[];
  readonly checkpointHistory:readonly Record<string,unknown>[];readonly retainedCheckpoints:readonly {readonly epoch:number;readonly globalStep:number;readonly path:string;readonly files:readonly TrainingFileRecord[]}[];
  readonly bestCheckpoint:{readonly epoch:number;readonly globalStep:number;readonly macroF1:number;readonly validationLoss:number;readonly path:string};readonly tieBreakRule:readonly string[];readonly tieBreakUsed:boolean;
  readonly finalExport:{readonly sourceCheckpoint:string;readonly path:string;readonly files:readonly TrainingFileRecord[]};readonly finalTrain:any;readonly finalValidation:any;readonly firstVsSecondComparison:any;
  readonly criteria:{readonly minimumDefinition:readonly string[];readonly minimumSuccess:boolean;readonly strongerDefinition:readonly string[];readonly strongerEvidence:boolean};readonly interpretationCase:string;
  readonly protectedDataExclusion:Record<string,unknown>;readonly thresholdCalibrationPerformed:boolean;readonly hyperparameterSearchPerformed:boolean;readonly productionIntegrationPerformed:boolean;readonly thirdRunCreated:boolean;readonly training:{readonly startedAt:string;readonly endedAt:string;readonly trainRuntimeSeconds:number};
}
const sha=(value:Buffer|string)=>crypto.createHash("sha256").update(value).digest("hex");
const shaFile=(filename:string):string=>{const digest=crypto.createHash("sha256"),handle=fs.openSync(filename,"r"),buffer=Buffer.allocUnsafe(8*1024*1024);try{let count=0;do{count=fs.readSync(handle,buffer,0,buffer.length,null);if(count)digest.update(buffer.subarray(0,count));}while(count);}finally{fs.closeSync(handle);}return digest.digest("hex");};
const metric=(run:MhsSecondTrainingRun,which:"finalTrain"|"finalValidation")=>run[which].metrics;
export const validateMhsSecondTrainingRun=(run:MhsSecondTrainingRun):void=>{
  const a=run.authorities,c=run.configuration,s=run.steps,i=run.cleanInitialization,p=run.protectedDataExclusion;
  if(run.schemaVersion!==MHS_SECOND_TRAINING_RUN_SCHEMA||run.runVersion!==MHS_SECOND_TRAINING_RUN_VERSION||run.terminalStatus!=="COMPLETED"||run.runCount!==1)throw new Error("Second-run identity mismatch");
  if(a.secondConfigSha256!==MHS_SECOND_TRAINING_CONFIG_SHA256||a.firstRunManifestSha256!==MHS_FIRST_TRAINING_RUN_SHA256||a.firstRunAssessmentSha256!==MHS_FIRST_RUN_ASSESSMENT_SHA256||a.classifierAuthoritySha256!==CLASSIFIER_BASE_AUTHORITY_SHA256||a.preprocessingContractSha256!==MHS_PREPROCESSING_ARTIFACT_SHA256||a.materializationManifestSha256!==MHS_MATERIALIZATION_MANIFEST_SHA256||a.trainSha256!==MHS_TRAIN_SHA256||a.validationSha256!==MHS_VALIDATION_SHA256)throw new Error("Second-run authority mismatch");
  if(i.source!=="PRISTINE_PINNED_BASE_XLM_ROBERTA"||i.repository!==CLASSIFIER_BASE_REPOSITORY||i.revision!==CLASSIFIER_BASE_REVISION||i.baseWeightFilename!=="model.safetensors"||i.baseWeightByteSize!==MHS_BASE_WEIGHT_BYTES||i.baseWeightSha256!==MHS_BASE_WEIGHT_SHA256||i.firstRunFinalUsed!==false||i.firstRunCheckpointUsed!==false)throw new Error("Clean initialization mismatch");
  if(JSON.stringify(run.toolchain)!==JSON.stringify({accelerate:"0.31.0",numpy:"1.26.4",python:"3.12.10",pytorch:"2.3.1+cpu",safetensors:"0.4.3",sentencepiece:"0.2.0",tokenizers:"0.19.1",transformers:"4.42.4"})||run.hardware.device!=="cpu"||run.hardware.cudaAvailable!==false||run.hardware.cudaVisibleDevices!==""||run.seed!==MHS_FIRST_TRAINING_SEED)throw new Error("Runtime identity mismatch");
  if(c.epochs!==5||c.learningRate!==2e-5||c.classWeighting!=="NONE"||c.oversampling!==false||c.warmupSteps!==2||c.precision!=="FP32"||c.decisionRule!=="ARGMAX_LOGITS"||s.batchesPerEpoch!==8||s.optimizerStepsPerEpoch!==8||s.totalOptimizerSteps!==40||s.schedulerSteps!==40)throw new Error("Frozen execution mismatch");
  const selected=[...run.epochs].sort((x:any,y:any)=>y.macroF1-x.macroF1||x.validationLoss-y.validationLoss||x.epoch-y.epoch)[0] as any;
  if(run.epochs.length!==5||run.epochs.some((e:any,n)=>e.epoch!==n+1||e.globalStep!==(n+1)*8)||run.checkpointHistory.length!==5||run.retainedCheckpoints.length>2||!selected||run.bestCheckpoint.epoch!==selected.epoch||run.bestCheckpoint.path!==run.finalExport.sourceCheckpoint||JSON.stringify(run.tieBreakRule)!==JSON.stringify(["HIGHER_MACRO_F1","LOWER_VALIDATION_LOSS","EARLIER_EPOCH"]))throw new Error("Checkpoint selection mismatch");
  const train=metric(run,"finalTrain"),validation=metric(run,"finalValidation"),minimum=train.predictedCounts.BLOCK>0&&train.perClass.BLOCK.recall>0&&train.macroF1>.4,stronger=minimum&&validation.confusionMatrix[1][1]>=1&&validation.macroF1>.40909090909090906&&validation.predictedCounts.BLOCK<13;
  if(run.criteria.minimumSuccess!==minimum||run.criteria.strongerEvidence!==stronger||run.interpretationCase!=="CASE_1_NO_TRAIN_BLOCK_LEARNING"||train.perClass.BLOCK.recall!==0)throw new Error("Predeclared result mismatch");
  if(p.internalTestAccessed||p.frozen140Accessed||p.monolithicCandidateAccessed||!p.onlyTrainValidationTextUsed||p.persistentTokenizedDataset||run.thresholdCalibrationPerformed||run.hyperparameterSearchPerformed||run.productionIntegrationPerformed||run.thirdRunCreated)throw new Error("Boundary attestation mismatch");
  if(run.runPayloadDigest!==MHS_SECOND_TRAINING_RUN_PAYLOAD_DIGEST||new Date(run.training.startedAt).toISOString()!==run.training.startedAt||new Date(run.training.endedAt).toISOString()!==run.training.endedAt||run.training.startedAt>=run.training.endedAt)throw new Error("Second-run payload/runtime mismatch");
};
export const verifyMhsSecondTrainingArtifacts=(run:MhsSecondTrainingRun,outputRoot:string):void=>{for(const group of [...run.retainedCheckpoints,run.finalExport])for(const record of group.files){const target=path.resolve(outputRoot,group.path,record.filename);if(fs.statSync(target).size!==record.byteSize||shaFile(target)!==record.sha256)throw new Error(`Second-run artifact mismatch: ${record.filename}`);}};
export const readMhsSecondTrainingRun=(manifestPath:string,outputRoot=path.resolve(process.cwd(),MHS_SECOND_TRAINING_CONFIG_OUTPUT_ROOT)):MhsSecondTrainingRun=>{const bytes=fs.readFileSync(manifestPath);if(sha(bytes)!==MHS_SECOND_TRAINING_RUN_SHA256)throw new Error("Second-run manifest SHA-256 mismatch");const canonical=bytes.toString("utf8").replace(/\r\n/g,"\n"),payload=canonical.replace(/^  "runPayloadDigest": "[0-9a-f]{64}",\n/m,"");const run=JSON.parse(canonical) as MhsSecondTrainingRun;if(sha(payload)!==run.runPayloadDigest)throw new Error("Second-run canonical payload mismatch");validateMhsSecondTrainingRun(run);verifyMhsSecondTrainingArtifacts(run,outputRoot);return run;};
export const publishMhsSecondTrainingRun=(bytes:Buffer,target:string,publish:(temporary:string,target:string)=>void=fs.renameSync):void=>{if(fs.existsSync(target))throw new Error("Second-run manifest exists; overwrite refused");const temporary=`${target}.${process.pid}-${Date.now()}.partial`;try{fs.writeFileSync(temporary,bytes,{flag:"wx"});publish(temporary,target);if(!fs.existsSync(target))throw new Error("Second-run manifest publication incomplete");}catch(error){fs.rmSync(target,{force:true});throw error;}finally{fs.rmSync(temporary,{force:true});}};
