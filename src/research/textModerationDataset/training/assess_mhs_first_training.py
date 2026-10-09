import hashlib,json,math,os,platform,sys
from datetime import datetime,timezone
from pathlib import Path

os.environ["CUDA_VISIBLE_DEVICES"]=""
os.environ["TOKENIZERS_PARALLELISM"]="false"
os.environ["HF_HUB_OFFLINE"]="1"
os.environ["TRANSFORMERS_OFFLINE"]="1"
os.environ["HF_HOME"]=str(Path(__file__).resolve().parents[4]/"evaluation-cache/text-moderation")

import numpy as np
import torch
from transformers import AutoModelForSequenceClassification,AutoTokenizer

EXPECTED={"run":"614c71a7b98266fc0ffaad71195fd40f998acda75817a623b3c191b3cfdab85c","config":"18e6f8d712881980dacf2ba954a5849312175126036d81a6786b6b041c6c9dff","preprocessing":"19746e06ebeddae21d78a29df2a3e6ff40d544b7a9f5383a925fed937a19e930","materialization":"848dcfb02b787dd0dfcd3d1f5a27d220d2958fc27be124252543b97b109f321f","train":"bc5a090c1fa5b815f72a09c1347b56418e0b3e022e27d724eb9465dd15924e54","validation":"0fd315fab802e0c3f09a454947190812e5f9f4331bb383258926b3b12aee65e7","final_model":"6f419d7471b311ccee8b858e221ccd2c5fa07815abf9f3c18067b2e0ef64044b","final_config":"74eb61965de2ab09565a8c91c0ffaeb8bd9b1b063ed543d3cb1dc244ee2064cc","binding":"c78104e46e6c4aacf21eda1659c7ad802aae1e71dd8f57af8b18401ebcec9ee3"}
CATEGORIES=["ABUSIVE_OR_HARASSING","HATE","PROFANITY","SEXUAL","THREAT_OR_VIOLENCE"]
def sha(p):
 h=hashlib.sha256()
 with open(p,"rb") as f:
  while b:=f.read(8*1024*1024):h.update(b)
 return h.hexdigest()
def canonical(v):return json.dumps(v,sort_keys=True,indent=2,ensure_ascii=False,separators=(",", ": "))+"\n"
def now():return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00","Z")
def rows(p):
 with open(p,"r",encoding="utf-8") as f:return [json.loads(line) for line in f if line.strip()]
def summary(values):
 a=np.asarray(values,dtype=np.float64)
 return {"count":int(a.size),"min":float(a.min()),"max":float(a.max()),"mean":float(a.mean()),"median":float(np.median(a)),"p25":float(np.quantile(a,.25,method="linear")),"p75":float(np.quantile(a,.75,method="linear"))}
def metrics(records):
 y=np.asarray([x["target"] for x in records]);p=np.asarray([x["predictedTarget"] for x in records]);cm=np.zeros((2,2),dtype=np.int64)
 for actual,predicted in zip(y,p):cm[actual,predicted]+=1
 classes={}
 for index,name in enumerate(("ALLOW","BLOCK")):
  tp=cm[index,index];fp=cm[:,index].sum()-tp;fn=cm[index,:].sum()-tp;precision=float(tp/(tp+fp)) if tp+fp else 0.;recall=float(tp/(tp+fn)) if tp+fn else 0.;f1=float(2*precision*recall/(precision+recall)) if precision+recall else 0.;classes[name]={"precision":precision,"recall":recall,"f1":f1,"support":int(cm[index,:].sum())}
 losses=[-math.log(max(x["allowProbability"] if x["target"]==0 else x["blockProbability"],1e-300)) for x in records]
 return {"loss":float(np.mean(losses)),"accuracy":float((y==p).mean()),"macroF1":float((classes["ALLOW"]["f1"]+classes["BLOCK"]["f1"])/2),"weightedF1":float((classes["ALLOW"]["f1"]*classes["ALLOW"]["support"]+classes["BLOCK"]["f1"]*classes["BLOCK"]["support"])/len(records)),"perClass":classes,"confusionMatrix":cm.tolist(),"predictedCounts":{"ALLOW":int((p==0).sum()),"BLOCK":int((p==1).sum())}}
def infer(model_path,tokenizer,data):
 model=AutoModelForSequenceClassification.from_pretrained(model_path,local_files_only=True,use_safetensors=True);model.eval()
 if model.training or next(model.parameters()).device.type!="cpu" or model.num_labels!=2:raise RuntimeError("Model evaluation-state mismatch")
 output=[]
 with torch.inference_mode():
  for start in range(0,len(data),8):
   batch=data[start:start+8];encoded=tokenizer([x["text"] for x in batch],padding="longest",truncation=True,max_length=128,add_special_tokens=True,return_attention_mask=True,return_token_type_ids=False,return_tensors="pt");logits=model(**encoded).logits;prob=torch.softmax(logits,dim=1)
   for row,logit,p in zip(batch,logits.tolist(),prob.tolist()):
    predicted=0 if logit[0]>=logit[1] else 1
    output.append({"exampleId":row["exampleId"],"candidateTextDigest":row["candidateTextDigest"],"trueDecision":row["decision"],"target":row["target"],"predictedDecision":"ALLOW" if predicted==0 else "BLOCK","predictedTarget":predicted,"correct":predicted==row["target"],"allowLogit":float(logit[0]),"blockLogit":float(logit[1]),"blockMargin":float(logit[1]-logit[0]),"allowProbability":float(p[0]),"blockProbability":float(p[1]),"confidence":float(max(p)),"primaryCategory":row["primaryCategory"],"secondaryCategories":row["secondaryCategories"],"reasonCode":row["reasonCode"],"language":row["language"],"script":row["script"],"sourceDataset":row["sourceDataset"]})
 del model
 return output
def distributions(records):
 out={}
 for target,name in ((0,"trueALLOW"),(1,"trueBLOCK")):
  group=[x for x in records if x["target"]==target];out[name]={"blockProbability":summary([x["blockProbability"] for x in group]),"blockMargin":summary([x["blockMargin"] for x in group])}
 return out
def margins(records):return {"greaterThanZero":sum(x["blockMargin"]>0 for x in records),"equalToZero":sum(x["blockMargin"]==0 for x in records),"lessThanZero":sum(x["blockMargin"]<0 for x in records),"byTrueLabel":{name:{"greaterThanZero":sum(x["blockMargin"]>0 for x in records if x["target"]==target),"equalToZero":sum(x["blockMargin"]==0 for x in records if x["target"]==target),"lessThanZero":sum(x["blockMargin"]<0 for x in records if x["target"]==target)} for target,name in ((0,"ALLOW"),(1,"BLOCK"))}}
def category(records):
 result={}
 for name in CATEGORIES:
  group=[x for x in records if x["target"]==1 and x["primaryCategory"]==name];support=len(group);result[name]={"support":support,"tinyDenominator":support<5,"predictedBlockCount":sum(x["predictedTarget"]==1 for x in group),"recall":float(sum(x["predictedTarget"]==1 for x in group)/support) if support else None,"meanBlockProbability":float(np.mean([x["blockProbability"] for x in group])) if support else None,"meanBlockMargin":float(np.mean([x["blockMargin"] for x in group])) if support else None}
 return result
def checkpoint_evidence(epoch2,epoch3,run):
 old={x["exampleId"]:x for x in epoch2};per=[]
 for current in epoch3:
  previous=old[current["exampleId"]];per.append({"exampleId":current["exampleId"],"trueDecision":current["trueDecision"],"epoch2BlockProbability":previous["blockProbability"],"epoch3BlockProbability":current["blockProbability"],"blockProbabilityChange":current["blockProbability"]-previous["blockProbability"],"epoch2BlockMargin":previous["blockMargin"],"epoch3BlockMargin":current["blockMargin"],"blockMarginChange":current["blockMargin"]-previous["blockMargin"]})
 groups={}
 for target,name in ((0,"trueALLOW"),(1,"trueBLOCK")):
  a=[x for x in epoch2 if x["target"]==target];b=[x for x in epoch3 if x["target"]==target];nll2=np.mean([-math.log(x["allowProbability"] if target==0 else x["blockProbability"]) for x in a]);nll3=np.mean([-math.log(x["allowProbability"] if target==0 else x["blockProbability"]) for x in b]);groups[name]={"epoch2MeanBlockProbability":float(np.mean([x["blockProbability"] for x in a])),"epoch3MeanBlockProbability":float(np.mean([x["blockProbability"] for x in b])),"meanBlockProbabilityChange":float(np.mean([x["blockProbability"] for x in b])-np.mean([x["blockProbability"] for x in a])),"epoch2MeanBlockMargin":float(np.mean([x["blockMargin"] for x in a])),"epoch3MeanBlockMargin":float(np.mean([x["blockMargin"] for x in b])),"meanBlockMarginChange":float(np.mean([x["blockMargin"] for x in b])-np.mean([x["blockMargin"] for x in a])),"epoch2MeanTrueClassNll":float(nll2),"epoch3MeanTrueClassNll":float(nll3),"meanTrueClassNllChange":float(nll3-nll2)}
 allow_improved=groups["trueALLOW"]["meanTrueClassNllChange"]<0;block_improved=groups["trueBLOCK"]["meanTrueClassNllChange"]<0
 explanation="BOTH_TRUE_CLASSES_IMPROVED" if allow_improved and block_improved else "CORRECT_ALLOW_CONFIDENCE_IMPROVED" if allow_improved else "TRUE_BLOCK_MOVED_TOWARD_BOUNDARY" if block_improved else "NEITHER_TRUE_CLASS_IMPROVED"
 return {"epoch2ValidationLoss":run["epochs"][1]["validationLoss"],"epoch3ValidationLoss":run["epochs"][2]["validationLoss"],"argmaxPredictionsUnchanged":all(old[x["exampleId"]]["predictedTarget"]==x["predictedTarget"] for x in epoch3),"trueClassSummaries":groups,"lowerLossExplanation":explanation,"perExample":per}
def main():
 backend=Path(__file__).resolve().parents[4];mhs=backend/"dataset-research/text-moderation/MEASURING_HATE_SPEECH";training=mhs/"training";materialized=mhs/"materialized";root=backend/"evaluation-cache/text-moderation/classifier-training/mhs-xlm-roberta-first-run-v1";base=backend/"evaluation-cache/text-moderation/classifier/facebookai-xlm-roberta-base/e73636d4f797dec63c3081bb6ed5c7b0bb3f2089";artifact=training/"mhs-xlm-roberta-first-run-validation-assessment-v1.json"
 paths={"run":training/"mhs-xlm-roberta-first-training-run-v1.json","config":training/"mhs-xlm-roberta-first-training-config-v1.json","preprocessing":mhs/"preprocessing/mhs-xlm-roberta-preprocessing-contract-v1.json","materialization":materialized/"mhs-materialization-manifest-v1.json","train":materialized/"mhs-train-v1.jsonl","validation":materialized/"mhs-validation-v1.jsonl","final_model":root/"final/model.safetensors","final_config":root/"final/config.json","binding":root/"final/tokenizer-binding.json"}
 if artifact.exists():raise RuntimeError("Validation assessment exists; overwrite refused")
 for name,p in paths.items():
  if sha(p)!=EXPECTED[name]:raise RuntimeError(f"Assessment authority SHA mismatch: {name}")
 run=json.loads(paths["run"].read_text(encoding="utf-8"));train=rows(paths["train"]);validation=rows(paths["validation"])
 if len(train)!=60 or len(validation)!=13 or torch.cuda.is_available():raise RuntimeError("Development population/CPU boundary mismatch")
 before=sha(paths["final_model"]);tokenizer=AutoTokenizer.from_pretrained(base,local_files_only=True,use_fast=True)
 final_train=infer(root/"final",tokenizer,train);final_validation=infer(root/"final",tokenizer,validation);epoch2_validation=infer(root/"checkpoints/checkpoint-epoch-02",tokenizer,validation)
 train_metrics=metrics(final_train);validation_metrics=metrics(final_validation);expected=run["epochs"][2]
 replay_deltas={"loss":validation_metrics["loss"]-expected["validationLoss"],"accuracy":validation_metrics["accuracy"]-expected["accuracy"],"macroF1":validation_metrics["macroF1"]-expected["macroF1"],"weightedF1":validation_metrics["weightedF1"]-expected["weightedF1"]}
 if max(abs(x) for x in replay_deltas.values())>1e-6 or validation_metrics["confusionMatrix"]!=expected["confusionMatrix"]:raise RuntimeError(f"Validation replay mismatch: {replay_deltas}")
 if before!=sha(paths["final_model"]):raise RuntimeError("Final model changed during assessment")
 if train_metrics["predictedCounts"]["BLOCK"]==0 and validation_metrics["predictedCounts"]["BLOCK"]==0:failure="COLLAPSE_ON_TRAIN_AND_VALIDATION"
 elif train_metrics["perClass"]["BLOCK"]["recall"]>0 and validation_metrics["perClass"]["BLOCK"]["recall"]==0:failure="LEARNS_TRAIN_BUT_NOT_VALIDATION"
 elif max(x["blockMargin"] for x in final_train+final_validation)<0 and distributions(final_train)["trueBLOCK"]["blockMargin"]["mean"]>distributions(final_train)["trueALLOW"]["blockMargin"]["mean"]:failure="WEAK_SEPARATION_BELOW_ARGMAX_BOUNDARY"
 else:failure="MIXED_OR_OTHER"
 trainer_state=json.loads((root/"checkpoints/checkpoint-epoch-03/trainer_state.json").read_text(encoding="utf-8"));logs=[{"epoch":x["epoch"],"step":x["step"],"trainingLoss":x["loss"],"learningRate":x["learning_rate"],"gradientNorm":x["grad_norm"]} for x in trainer_state["log_history"] if "loss" in x]
 dynamics={"availableEpochLogs":logs,"trainingLossMonotonic":all(logs[i]["trainingLoss"]<=logs[i-1]["trainingLoss"] for i in range(1,len(logs))),"validationLossMonotonic":all(run["epochs"][i]["validationLoss"]<run["epochs"][i-1]["validationLoss"] for i in range(1,3)),"plateauConclusion":"NOT_DEMONSTRATED_EPOCH_TRAINING_LOSS_NOT_MONOTONIC","continuationEvidence":"INSUFFICIENT_TO_PREFER_SAME_CONFIG_CONTINUATION"}
 recommendation="AUTHORIZE_CONTROLLED_SECOND_TRAINING_CONFIG_DESIGN"
 payload={"schemaVersion":"STHN_TEXT_MODERATION_MHS_FIRST_RUN_VALIDATION_ASSESSMENT_V1","assessmentVersion":"MHS_XLM_ROBERTA_FIRST_RUN_VALIDATION_ASSESSMENT_V1","phase":"T6L-7E","status":"DEVELOPMENT_EVIDENCE_ASSESSED","authorities":{"firstRunManifestSha256":EXPECTED["run"],"finalModelSha256":EXPECTED["final_model"],"finalConfigSha256":EXPECTED["final_config"],"tokenizerBindingSha256":EXPECTED["binding"],"trainingConfigSha256":EXPECTED["config"],"preprocessingContractSha256":EXPECTED["preprocessing"],"materializationManifestSha256":EXPECTED["materialization"],"trainSha256":EXPECTED["train"],"validationSha256":EXPECTED["validation"]},"selectedCheckpoint":run["bestCheckpoint"],"decisionRule":{"kind":"ARGMAX_LOGITS","blockMarginDefinition":"BLOCK_LOGIT_MINUS_ALLOW_LOGIT","boundary":0,"boundaryChanged":False},"train":{"count":60,"groundTruthCounts":{"ALLOW":40,"BLOCK":20},"metrics":train_metrics,"predictions":final_train,"trueClassDistributions":distributions(final_train),"marginSummary":margins(final_train),"misclassifications":[x for x in final_train if not x["correct"]],"categoryDiagnostics":category(final_train)},"validation":{"count":13,"groundTruthCounts":{"ALLOW":9,"BLOCK":4},"metrics":validation_metrics,"replay":{"tolerance":1e-6,"expectedEpoch":3,"deltas":replay_deltas,"matched":True},"predictions":final_validation,"trueClassDistributions":distributions(final_validation),"marginSummary":margins(final_validation),"misclassifications":[x for x in final_validation if not x["correct"]],"categoryDiagnostics":category(final_validation)},"checkpointDevelopmentEvidence":checkpoint_evidence(epoch2_validation,final_validation,run),"trainingDynamics":dynamics,"failureModeClassification":failure,"classImbalanceAssessment":{"trainRatioAllowToBlock":"2:1","imbalanceExists":True,"primaryCauseDemonstrated":False,"conclusion":"IMBALANCE_IS_A_PLAUSIBLE_CONTRIBUTOR_NOT_AN_ESTABLISHED_PRIMARY_CAUSE"},"dataScaleLimitations":{"trainCount":60,"validationCount":13,"validationBlockCount":4,"limitations":["VERY_SMALL_TRAINING_SET","VALIDATION_ESTIMATES_HIGH_VARIANCE","FOUR_BLOCK_VALIDATION_EXAMPLES_CANNOT_SUPPORT_STRONG_CATEGORY_OR_GENERALIZATION_CLAIMS","DEVELOPMENT_EVIDENCE_ONLY"]},"primaryNextActionRecommendation":recommendation,"rationale":["The engineering pipeline and immutable validation replay succeeded.","The frozen ARGMAX rule shows inadequate BLOCK discrimination and must not be threshold-adjusted here.","Twenty-four optimizer steps on 60 rows do not isolate optimization duration, class balance, data scale, or seed sensitivity as the cause.","A bounded design phase can compare those hypotheses without authorizing a second run or choosing hyperparameters in this assessment."],"nextPhaseInvestigationIssues":["optimization-duration evidence","loss and sampling strategy alternatives without assuming class weighting","data sufficiency and category coverage","seed-robustness design","predeclared success and stop criteria"],"modelQualityStatus":"NOT_YET_ADEQUATE","engineeringStatus":"SUCCESSFUL","boundaries":{"developmentSources":["TRAIN","VALIDATION"],"internalTestAccessed":False,"frozen140Accessed":False,"monolithicCandidateAccessed":False,"developmentProjectionAccessed":False,"retrainingPerformed":False,"optimizerCreated":False,"backwardPassPerformed":False,"modelWeightsChanged":False,"thresholdCalibrationPerformed":False,"thresholdSearchPerformed":False,"productionIntegrationPerformed":False},"runtime":{"device":"cpu","inferenceMode":True,"modelEvalMode":True,"python":platform.python_version(),"pytorch":torch.__version__},"generatedAt":now()}
 payload["assessmentPayloadDigest"]=hashlib.sha256(canonical(payload).encode("utf-8")).hexdigest();text=canonical(payload)
 temporary=artifact.with_name(artifact.name+f".{os.getpid()}.partial")
 try:
  temporary.write_bytes(text.encode("utf-8"));os.replace(temporary,artifact)
 except Exception:
  if temporary.exists():temporary.unlink()
  if artifact.exists():artifact.unlink()
  raise
 print(canonical({"artifact":str(artifact),"artifactSha256":sha(artifact),"payloadDigest":payload["assessmentPayloadDigest"],"failureMode":failure,"recommendation":recommendation,"trainMetrics":train_metrics,"validationMetrics":validation_metrics}))
if __name__=="__main__":main()
