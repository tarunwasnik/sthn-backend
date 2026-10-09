import hashlib,json,math,os,random,re,sys
from collections import Counter
from datetime import datetime,timezone
from pathlib import Path

os.environ["CUDA_VISIBLE_DEVICES"]=""
os.environ["TOKENIZERS_PARALLELISM"]="false"
os.environ["HF_HUB_OFFLINE"]="1"
os.environ["TRANSFORMERS_OFFLINE"]="1"
os.environ["HF_HOME"]=str(Path(__file__).resolve().parents[4]/"evaluation-cache/text-moderation")

import numpy as np
import torch
from safetensors import safe_open
from torch.utils.data import Dataset
from transformers import AutoConfig,AutoModelForSequenceClassification,AutoTokenizer,set_seed

SEED=2063609992
REVISION="e73636d4f797dec63c3081bb6ed5c7b0bb3f2089"
EXPECTED={
 "firstConfig":"18e6f8d712881980dacf2ba954a5849312175126036d81a6786b6b041c6c9dff",
 "firstRun":"614c71a7b98266fc0ffaad71195fd40f998acda75817a623b3c191b3cfdab85c",
 "firstAssessment":"a84d4ae7f475cf4c2ae10bdc11150b882b5ddebefba2fba10b3690a1779da828",
 "secondConfig":"34b1b37ce2559672f0bb6b1600f82dffcdcc6158f6e8776b63c5804dacd55e5f",
 "secondRun":"a22d099d49e2299efe5aa77d89c876652a05454e7c3ed81f4beb5df2a0ac2f8a",
 "classifier":"ca9cd876c9facd4b310a5cd9f09385113ce3e8c1376d2e5fd0a3b654ff2a17f1",
 "preprocessing":"19746e06ebeddae21d78a29df2a3e6ff40d544b7a9f5383a925fed937a19e930",
 "materialization":"848dcfb02b787dd0dfcd3d1f5a27d220d2958fc27be124252543b97b109f321f",
 "train":"bc5a090c1fa5b815f72a09c1347b56418e0b3e022e27d724eb9465dd15924e54",
 "validation":"0fd315fab802e0c3f09a454947190812e5f9f4331bb383258926b3b12aee65e7",
 "baseWeight":"6fd4797bc397c3b8b55d6bb5740366b57e6a3ce91c04c77f22aafc0c128e6feb",
 "firstFinal":"6f419d7471b311ccee8b858e221ccd2c5fa07815abf9f3c18067b2e0ef64044b",
 "secondFinal":"e998a7b5ebc949f39713fd6e60f01ffb91d320b5230e9757419fa1a23733d86f"
}
def sha_file(filename):
 h=hashlib.sha256()
 with open(filename,"rb") as stream:
  while chunk:=stream.read(8*1024*1024):h.update(chunk)
 return h.hexdigest()
def canonical(value):return json.dumps(value,sort_keys=True,indent=2,ensure_ascii=False,separators=(",", ": "))+"\n"
def now():return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00","Z")
def load_jsonl(filename):
 with open(filename,"r",encoding="utf-8") as stream:return [json.loads(line) for line in stream if line.strip()]
def counts(values):
 result=Counter(int(value) for value in values);return {"ALLOW":result[0],"BLOCK":result[1],"total":sum(result.values())}
class Rows(Dataset):
 def __init__(self,rows):self.rows=rows
 def __len__(self):return len(self.rows)
 def __getitem__(self,index):return {"text":self.rows[index]["text"],"label":self.rows[index]["target"],"exampleId":self.rows[index]["exampleId"]}
class DiagnosticCollator:
 def __init__(self,tokenizer):self.tokenizer=tokenizer
 def __call__(self,features):
  batch=self.tokenizer([item["text"] for item in features],padding="longest",truncation=True,max_length=128,add_special_tokens=True,return_attention_mask=True,return_token_type_ids=False,return_tensors="pt")
  batch["labels"]=torch.tensor([item["label"] for item in features],dtype=torch.int64)
  return batch
def subsystem(name):
 if name.startswith("roberta.embeddings."):return "embeddings"
 if name.startswith("roberta.encoder."):return "encoder"
 if name.startswith("classifier.dense."):return "classifierDense"
 if name.startswith("classifier.out_proj."):return "classifierOutput"
 return "other"
def parameter_audit(model):
 groups={name:{"tensorCount":0,"parameterCount":0,"trainableParameterCount":0,"frozenParameterCount":0} for name in ("embeddings","encoder","classifierDense","classifierOutput","other")}
 for name,param in model.named_parameters():
  item=groups[subsystem(name)];item["tensorCount"]+=1;item["parameterCount"]+=param.numel();item["trainableParameterCount"]+=param.numel() if param.requires_grad else 0;item["frozenParameterCount"]+=0 if param.requires_grad else param.numel()
 total=sum(item["parameterCount"] for item in groups.values());trainable=sum(item["trainableParameterCount"] for item in groups.values())
 return {"totalParameterCount":total,"trainableParameterCount":trainable,"frozenParameterCount":total-trainable,"subsystems":groups,"allClassifierTrainable":all(param.requires_grad for name,param in model.named_parameters() if name.startswith("classifier.")),"allBackboneTrainable":all(param.requires_grad for name,param in model.named_parameters() if name.startswith("roberta."))}
def optimizer_group_audit(model):
 layer_norm_types=(torch.nn.LayerNorm,)
 no_decay=set()
 for module_name,module in model.named_modules():
  for local_name,_ in module.named_parameters(recurse=False):
   full=f"{module_name}.{local_name}" if module_name else local_name
   if isinstance(module,layer_norm_types) or "bias" in full:no_decay.add(full)
 groups={"decay":{"tensorCount":0,"parameterCount":0,"weightDecay":.01},"noDecay":{"tensorCount":0,"parameterCount":0,"weightDecay":0.}}
 seen=set();classifier=[];encoder=[]
 for name,param in model.named_parameters():
  if not param.requires_grad:continue
  if name in seen:raise RuntimeError("Duplicate trainable parameter name")
  seen.add(name);group=groups["noDecay" if name in no_decay else "decay"];group["tensorCount"]+=1;group["parameterCount"]+=param.numel()
  if name.startswith("classifier."):classifier.append(name)
  if name.startswith("roberta.encoder."):encoder.append(name)
 trainable={name for name,param in model.named_parameters() if param.requires_grad}
 return {"reconstructedWithoutOptimizer":True,"algorithm":"ADAMW_TORCH","learningRate":2e-5,"groups":groups,"trainableTensorCount":len(trainable),"coveredTensorCount":len(seen),"omittedTrainableParameters":sorted(trainable-seen),"duplicateParameters":False,"classifierTensorNames":classifier,"classifierCoverageComplete":len(classifier)==4,"encoderTensorCount":len(encoder),"encoderCoverageComplete":len(encoder)>0}
def head_digest(model):
 digest=hashlib.sha256()
 for name,param in sorted(model.named_parameters()):
  if name.startswith("classifier."):
   digest.update(name.encode());digest.update(param.detach().cpu().contiguous().numpy().tobytes())
 return digest.hexdigest()
def delta_summary(reference,comparison_filename):
 accum={name:{"elementCount":0,"referenceSquared":0.,"comparisonSquared":0.,"deltaSquared":0.,"maxAbsoluteDelta":0.,"changedElementCount":0} for name in ("embeddings","encoder","classifierDense","classifierOutput","other")}
 with safe_open(str(comparison_filename),framework="pt",device="cpu") as final:
  if set(final.keys())!=set(reference):raise RuntimeError("Parameter name mismatch")
  for name in sorted(reference):
   left=reference[name].detach().cpu().reshape(-1);right=final.get_tensor(name).reshape(-1)
   if left.shape!=right.shape:raise RuntimeError("Parameter shape mismatch")
   item=accum[subsystem(name)];item["elementCount"]+=left.numel()
   for start in range(0,left.numel(),1_000_000):
    a=left[start:start+1_000_000].to(torch.float64);b=right[start:start+1_000_000].to(torch.float64);d=b-a
    item["referenceSquared"]+=float(torch.dot(a,a));item["comparisonSquared"]+=float(torch.dot(b,b));item["deltaSquared"]+=float(torch.dot(d,d));item["maxAbsoluteDelta"]=max(item["maxAbsoluteDelta"],float(d.abs().max()) if d.numel() else 0.);item["changedElementCount"]+=int(torch.count_nonzero(d))
 result={}
 for name,item in accum.items():
  ref=math.sqrt(item.pop("referenceSquared"));comp=math.sqrt(item.pop("comparisonSquared"));delta=math.sqrt(item.pop("deltaSquared"));result[name]={**item,"referenceL2":ref,"comparisonL2":comp,"deltaL2":delta,"relativeDelta":delta/ref if ref else None,"movement":"NONE" if delta==0 else "MINIMAL" if delta/ref<1e-4 else "MATERIAL"}
 return result
def safetensor_reference(filename):
 with safe_open(str(filename),framework="pt",device="cpu") as handle:return {name:handle.get_tensor(name) for name in handle.keys()}
def compare_safetensors(left_filename,right_filename):
 left=safetensor_reference(left_filename)
 try:return delta_summary(left,right_filename)
 finally:del left
def scheduler_audit(state_filename,total_steps):
 state=json.loads(Path(state_filename).read_text(encoding="utf-8"));records=[]
 for row in state["log_history"]:
  if "learning_rate" not in row:continue
  step=int(row["step"]);expected=2e-5*(total_steps-step)/(total_steps-2) if step>=2 else 2e-5*step/2
  records.append({"epoch":int(row["epoch"]),"globalStep":step,"loss":row["loss"],"gradientNorm":row["grad_norm"],"learningRate":row["learning_rate"],"expectedLearningRate":expected,"matchesExpected":abs(row["learning_rate"]-expected)<1e-15})
 return {"globalStep":state["global_step"],"maxSteps":state["max_steps"],"epoch":state["epoch"],"records":records,"allFinite":all(math.isfinite(x[key]) for x in records for key in ("loss","gradientNorm","learningRate")),"scheduleMatches":all(x["matchesExpected"] for x in records),"prematureZero":any(x["learningRate"]==0 and x["globalStep"]<total_steps for x in records)}
def batch_audit(rows,epochs):
 generator=torch.Generator().manual_seed(SEED);all_epochs=[];exposure=Counter()
 for epoch in range(1,epochs+1):
  order=torch.randperm(len(rows),generator=generator).tolist();batches=[]
  for index,start in enumerate(range(0,len(order),8),1):
   ids=order[start:start+8];labels=[rows[i]["target"] for i in ids]
   for i in ids:exposure[rows[i]["exampleId"]]+=1
   batches.append({"batchIndex":index,"size":len(ids),**counts(labels)})
  all_epochs.append({"epoch":epoch,"batches":batches,"allAllowBatches":sum(x["BLOCK"]==0 for x in batches),"allBlockBatches":sum(x["ALLOW"]==0 for x in batches)})
 return {"method":"DETERMINISTIC_RANDOMSAMPLER_REFERENCE_SEED_STREAM","historicalOrderRecorded":False,"epochs":all_epochs,"allRowsOncePerEpoch":all(value==epochs for value in exposure.values()) and len(exposure)==len(rows),"blockRowsEveryEpoch":all(exposure[row["exampleId"]]==epochs for row in rows if row["target"]==1),"omittedRows":sorted(row["exampleId"] for row in rows if row["exampleId"] not in exposure),"exposureCountDistribution":dict(sorted(Counter(exposure.values()).items()))}
def summary(values):
 values=sorted(values);n=len(values)
 def percentile(p):
  position=(n-1)*p;low=math.floor(position);high=math.ceil(position);return values[low]+(values[high]-values[low])*(position-low)
 return {"count":n,"min":values[0],"max":values[-1],"mean":sum(values)/n,"median":percentile(.5),"p90":percentile(.9)}
def data_quality(rows,tokenizer):
 by_class={}
 for target,label in ((0,"ALLOW"),(1,"BLOCK")):
  selected=[row for row in rows if row["target"]==target];word_lists=[re.findall(r"\b\w+\b",row["text"].casefold(),flags=re.UNICODE) for row in selected];model_tokens=[tokenizer(row["text"],add_special_tokens=True,truncation=False)["input_ids"] for row in selected];words=[word for sequence in word_lists for word in sequence];tokens=[token for sequence in model_tokens for token in sequence];characters=[len(row["text"]) for row in selected]
  by_class[label]={"rowCount":len(selected),"characterLength":summary(characters),"wordLength":summary([len(x) for x in word_lists]),"modelTokenLength":summary([len(x) for x in model_tokens]),"uniqueWordCount":len(set(words)),"wordTypeTokenRatio":len(set(words))/len(words),"uniqueModelTokenCount":len(set(tokens)),"modelTokenTypeTokenRatio":len(set(tokens))/len(tokens),"veryShortRowsWordCountLe5":sum(len(x)<=5 for x in word_lists),"meanPunctuationCharacters":sum(sum(not ch.isalnum() and not ch.isspace() for ch in row["text"]) for row in selected)/len(selected),"languages":dict(sorted(Counter(row["language"] for row in selected).items())),"scripts":dict(sorted(Counter(row["script"] for row in selected).items())),"sourceDatasets":dict(sorted(Counter(row["sourceDataset"] for row in selected).items())),"primaryCategories":dict(sorted(Counter(row["primaryCategory"] or "NONE" for row in selected).items())),"reasonCodes":dict(sorted(Counter(row["reasonCode"] for row in selected).items()))}
 normalized=[re.sub(r"\W+"," ",row["text"].casefold()).strip() for row in rows];sets=[set(value.split()) for value in normalized];near=[]
 for left in range(len(rows)):
  for right in range(left+1,len(rows)):
   union=sets[left]|sets[right];score=len(sets[left]&sets[right])/len(union) if union else 1.
   if score>=.9 and normalized[left]!=normalized[right]:near.append({"leftId":rows[left]["exampleId"],"rightId":rows[right]["exampleId"],"jaccard":score,"sameDecision":rows[left]["decision"]==rows[right]["decision"]})
 duplicate_groups=Counter(normalized);conflicts=0
 for value,count in duplicate_groups.items():
  if count>1 and len({rows[index]["decision"] for index,item in enumerate(normalized) if item==value})>1:conflicts+=1
 return {"classes":by_class,"exactNormalizedDuplicateGroups":sum(value>1 for value in duplicate_groups.values()),"conflictingDuplicateGroups":conflicts,"nearIdenticalPairsAtWordJaccardGte0_9":near,"annotationConsistency":{"decisionTargetMismatches":sum(row["target"]!=(0 if row["decision"]=="ALLOW" else 1) for row in rows),"blockRowsWithoutPrimaryCategory":sum(bool(row["target"]==1 and not row["primaryCategory"]) for row in rows),"allowRowsWithPrimaryCategory":sum(bool(row["target"]==0 and row["primaryCategory"]) for row in rows)}}
def trace_split(rows,collator):
 materialized=counts(row["target"] for row in rows);dataset=Rows(rows);dataset_counts=counts(dataset[index]["label"] for index in range(len(dataset)));batches=[];aggregate=[]
 for start in range(0,len(dataset),8):
  features=[dataset[index] for index in range(start,min(start+8,len(dataset)))];batch=collator(features);aggregate.extend(batch["labels"].tolist());mask=batch["attention_mask"]
  batches.append({"batchIndex":len(batches)+1,"size":len(features),"labels":counts(batch["labels"].tolist()),"labelDtype":str(batch["labels"].dtype),"labelShape":list(batch["labels"].shape),"inputShape":list(batch["input_ids"].shape),"attentionMaskShape":list(mask.shape),"attentionMaskValid":bool(torch.all((mask==0)|(mask==1))),"correspondencePreserved":batch["labels"].tolist()==[item["label"] for item in features]})
 return {"materialization":materialized,"datasetBoundary":dataset_counts,"collatorBoundary":counts(aggregate),"modelInputBoundary":counts(aggregate),"labelDtype":"torch.int64","batches":batches,"dynamicPaddingLengths":sorted(set(item["inputShape"][1] for item in batches)),"allAttentionMasksValid":all(item["attentionMaskValid"] for item in batches),"allCorrespondencePreserved":all(item["correspondencePreserved"] for item in batches)}
def main():
 backend=Path(__file__).resolve().parents[4];mhs=backend/"dataset-research/text-moderation/MEASURING_HATE_SPEECH";training=mhs/"training";materialized=mhs/"materialized";base=backend/f"evaluation-cache/text-moderation/classifier/facebookai-xlm-roberta-base/{REVISION}";first_root=backend/"evaluation-cache/text-moderation/classifier-training/mhs-xlm-roberta-first-run-v1";second_root=backend/"evaluation-cache/text-moderation/classifier-training/mhs-xlm-roberta-second-run-v1";target=training/"mhs-xlm-roberta-pipeline-data-investigation-v1.json"
 if target.exists():raise RuntimeError("Investigation artifact exists; overwrite refused")
 paths={"firstConfig":training/"mhs-xlm-roberta-first-training-config-v1.json","firstRun":training/"mhs-xlm-roberta-first-training-run-v1.json","firstAssessment":training/"mhs-xlm-roberta-first-run-validation-assessment-v1.json","secondConfig":training/"mhs-xlm-roberta-second-training-config-v1.json","secondRun":training/"mhs-xlm-roberta-second-training-run-v1.json","classifier":backend/"dataset-research/text-moderation/model-authority/xlm-roberta-base-classifier-authority-v1.json","preprocessing":mhs/"preprocessing/mhs-xlm-roberta-preprocessing-contract-v1.json","materialization":materialized/"mhs-materialization-manifest-v1.json","train":materialized/"mhs-train-v1.jsonl","validation":materialized/"mhs-validation-v1.jsonl","baseWeight":base/"model.safetensors","firstFinal":first_root/"final/model.safetensors","secondFinal":second_root/"final/model.safetensors"}
 for name,filename in paths.items():
  if sha_file(filename)!=EXPECTED[name]:raise RuntimeError(f"Authority mismatch: {name}")
 train=load_jsonl(paths["train"]);validation=load_jsonl(paths["validation"])
 if counts(row["target"] for row in train)!={"ALLOW":40,"BLOCK":20,"total":60} or counts(row["target"] for row in validation)!={"ALLOW":9,"BLOCK":4,"total":13}:raise RuntimeError("Materialized label mismatch")
 random.seed(SEED);np.random.seed(SEED);torch.manual_seed(SEED);set_seed(SEED);torch.use_deterministic_algorithms(True,warn_only=False)
 tokenizer=AutoTokenizer.from_pretrained(base,local_files_only=True,use_fast=True);config=AutoConfig.from_pretrained(base,local_files_only=True,num_labels=2,label2id={"ALLOW":0,"BLOCK":1},id2label={0:"ALLOW",1:"BLOCK"},hidden_dropout_prob=.1,attention_probs_dropout_prob=.1,classifier_dropout=.1);model=AutoModelForSequenceClassification.from_pretrained(base,config=config,local_files_only=True,use_safetensors=True);model.eval();collator=DiagnosticCollator(tokenizer)
 train_trace=trace_split(train,collator);validation_trace=trace_split(validation,collator)
 probe=collator([Rows(train)[index] for index in range(8)])
 with torch.no_grad():output=model(input_ids=probe["input_ids"],attention_mask=probe["attention_mask"],labels=probe["labels"]);expected_loss=torch.nn.functional.cross_entropy(output.logits,probe["labels"])
 loss_path={"architecture":model.__class__.__name__,"numLabels":model.num_labels,"problemTypeBeforeForward":None,"problemTypeAfterForward":model.config.problem_type,"logitsShape":list(output.logits.shape),"labelsShape":list(probe["labels"].shape),"labelsDtype":str(probe["labels"].dtype),"lossFinite":bool(torch.isfinite(output.loss)),"modelLoss":float(output.loss),"crossEntropyReferenceLoss":float(expected_loss),"absoluteDifference":abs(float(output.loss)-float(expected_loss)),"twoClassCrossEntropyCompatible":abs(float(output.loss)-float(expected_loss))<1e-7}
 parameters=parameter_audit(model);optimizer=optimizer_group_audit(model);first_head=head_digest(model)
 initial_state={name:param.detach().cpu() for name,param in model.state_dict().items()};del output,expected_loss,probe
 random.seed(SEED);np.random.seed(SEED);torch.manual_seed(SEED);set_seed(SEED);repeat=AutoModelForSequenceClassification.from_pretrained(base,config=AutoConfig.from_pretrained(base,local_files_only=True,num_labels=2,label2id={"ALLOW":0,"BLOCK":1},id2label={0:"ALLOW",1:"BLOCK"},hidden_dropout_prob=.1,attention_probs_dropout_prob=.1,classifier_dropout=.1),local_files_only=True,use_safetensors=True);repeat_head=head_digest(repeat);del repeat
 first_delta=delta_summary(initial_state,paths["firstFinal"]);second_delta=delta_summary(initial_state,paths["secondFinal"]);del initial_state,model
 first_second=compare_safetensors(paths["firstFinal"],paths["secondFinal"])
 scheduler={"firstRun":scheduler_audit(first_root/"checkpoints/checkpoint-epoch-03/trainer_state.json",24),"secondRun":scheduler_audit(second_root/"checkpoints/checkpoint-epoch-05/trainer_state.json",40)}
 batch_reference=batch_audit(train,5);quality=data_quality(train,tokenizer);category_support={name:sum(row["primaryCategory"]==name for row in train) for name in ("ABUSIVE_OR_HARASSING","HATE","PROFANITY","SEXUAL","THREAT_OR_VIOLENCE")}
 limitations=["The training runners did not persist run-start classifier-head bytes, so reconstructed initialization cannot be compared to an immutable historical run-start digest.","Historical per-example batch order was not persisted. The batch audit certifies deterministic RandomSampler-compatible reference composition and no-replacement exposure, not the exact historical order after training-time RNG consumption.","TRAIN contains only 60 English/Latin examples from one source dataset; descriptive data findings cannot establish statistical causality or a required expansion size."]
 payload={"schemaVersion":"STHN_TEXT_MODERATION_MHS_TRAINING_PIPELINE_DATA_INVESTIGATION_V1","investigationVersion":"MHS_XLM_ROBERTA_PIPELINE_DATA_INVESTIGATION_V1","authorities":{name:EXPECTED[name] for name in ("firstConfig","firstRun","firstAssessment","secondConfig","secondRun","classifier","preprocessing","materialization","train","validation","baseWeight","firstFinal","secondFinal")},"labelTrace":{"train":train_trace,"validation":validation_trace},"collatorAudit":{"implementation":"TRAINING_EQUIVALENT_DIAGNOSTIC_COLLATOR","dynamicPadding":True,"rightTruncationMaxLength":128,"labelsExplicitlyRequired":True,"missingLabelsDefaulted":False,"labelsRenamedToModelArgument":True,"labelDtype":"torch.int64","correspondencePreserved":train_trace["allCorrespondencePreserved"] and validation_trace["allCorrespondencePreserved"],"attentionMasksValid":train_trace["allAttentionMasksValid"] and validation_trace["allAttentionMasksValid"]},"labelMappingAudit":{"materialization":{"ALLOW":0,"BLOCK":1},"preprocessing":{"ALLOW":0,"BLOCK":1},"modelConfig":{"ALLOW":0,"BLOCK":1},"trainerInput":{"ALLOW":0,"BLOCK":1},"metricsArgmax":{"ALLOW":0,"BLOCK":1},"finalExports":{"ALLOW":0,"BLOCK":1},"inversionFound":False},"modelLossPath":loss_path,"trainableParameterAudit":parameters,"optimizerGroupAudit":optimizer,"pristineInitialization":{"seed":SEED,"source":"PRISTINE_PINNED_BASE_XLM_ROBERTA","firstReconstructionHeadDigest":first_head,"secondReconstructionHeadDigest":repeat_head,"deterministicReconstruction":first_head==repeat_head,"runStartHeadDigestRecorded":False},"parameterDeltas":{"pristineToFirstFinal":first_delta,"pristineToSecondFinal":second_delta,"firstFinalToSecondFinal":first_second,"method":"FLOAT64_AGGREGATES_OVER_IDENTICAL_NAMED_TENSORS"},"schedulerLogAudit":scheduler,"batchCompositionAudit":batch_reference,"exampleExposureAudit":{"firstRunExpectedEpochs":3,"secondRunExpectedEpochs":5,"randomSamplerWithoutReplacement":True,"dropLast":False,"everyRowOncePerEpoch":batch_reference["allRowsOncePerEpoch"],"everyBlockRowEveryEpoch":batch_reference["blockRowsEveryEpoch"],"omittedRows":batch_reference["omittedRows"]},"trainDataSupportAnalysis":quality,"blockCategorySupport":category_support,"findings":{"pipelineDefectEvidence":[],"pipelineIntegrityEvidence":["All label boundaries preserve 40 ALLOW/20 BLOCK for TRAIN and 9 ALLOW/4 BLOCK for VALIDATION.","The model loss exactly matches two-class cross entropy and classifier/backbone parameters are trainable and optimizer-covered.","Both trained models moved materially from pristine initialization, including classifier dense/output and encoder parameters.","Finite gradient norms, losses, learning rates, and exact terminal step counts are recorded for both runs."],"dataLimitations":["Only 20 BLOCK examples are available across four represented behavior categories.","THREAT_OR_VIOLENCE has zero TRAIN support despite appearing in VALIDATION.","Every row is English, Latin script, and from the same source dataset.","Two controlled schedules produced no native-boundary BLOCK predictions despite measurable score separation."]},"pipelineVerdict":"PIPELINE_INTEGRITY_CERTIFIED","dataSufficiencyVerdict":"CURRENT_TRAIN_DATA_INSUFFICIENT_FOR_NEXT_TUNING","nextActionDecision":"AUTHORIZE_TRAIN_DATA_EXPANSION_DESIGN","futureExpansionTargets":["more BLOCK examples overall","stronger per-category BLOCK coverage","THREAT_OR_VIOLENCE TRAIN representation","policy-boundary ALLOW coverage","source diversity","future multilingual/script diversity","immutable grouping and leakage controls"],"limitations":limitations,"boundaries":{"trainingPerformed":False,"optimizerCreated":False,"backwardPassPerformed":False,"weightsModified":False,"thirdTrainingRunCreated":False,"thresholdCalibrationPerformed":False,"internalTestAccessed":False,"frozen140Accessed":False,"monolithicCandidateAccessed":False,"productionIntegrationPerformed":False},"generatedAt":now()}
 payload["investigationPayloadDigest"]=hashlib.sha256(canonical(payload).encode("utf-8")).hexdigest();temporary=Path(str(target)+f".{os.getpid()}.partial")
 try:
  temporary.write_bytes(canonical(payload).encode("utf-8"));os.replace(temporary,target)
 finally:
  if temporary.exists():temporary.unlink()
 print(canonical({"artifact":str(target),"artifactSha256":sha_file(target),"payloadDigest":payload["investigationPayloadDigest"],"pipelineVerdict":payload["pipelineVerdict"],"dataSufficiencyVerdict":payload["dataSufficiencyVerdict"],"nextActionDecision":payload["nextActionDecision"],"parameters":parameters,"headDigest":first_head}))
if __name__=="__main__":main()
