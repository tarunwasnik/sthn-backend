import hashlib,json,math,os,platform,random,sys
from datetime import datetime,timezone
from pathlib import Path

os.environ["CUDA_VISIBLE_DEVICES"]=""
os.environ["TOKENIZERS_PARALLELISM"]="false"
os.environ["HF_HUB_OFFLINE"]="1"
os.environ["TRANSFORMERS_OFFLINE"]="1"
os.environ["HF_HOME"]=str(Path(__file__).resolve().parents[4]/"evaluation-cache/text-moderation")

import accelerate,numpy as np,psutil,safetensors,sentencepiece,tokenizers,torch,transformers
from torch.utils.data import Dataset
from transformers import AutoConfig,AutoModelForSequenceClassification,AutoTokenizer,Trainer,TrainerCallback,TrainingArguments,set_seed

SEED=2063609992
REVISION="e73636d4f797dec63c3081bb6ed5c7b0bb3f2089"
BASE_WEIGHT_SHA="6fd4797bc397c3b8b55d6bb5740366b57e6a3ce91c04c77f22aafc0c128e6feb"
EXPECTED={"second_config":"34b1b37ce2559672f0bb6b1600f82dffcdcc6158f6e8776b63c5804dacd55e5f","first_run":"614c71a7b98266fc0ffaad71195fd40f998acda75817a623b3c191b3cfdab85c","assessment":"a84d4ae7f475cf4c2ae10bdc11150b882b5ddebefba2fba10b3690a1779da828","classifier":"ca9cd876c9facd4b310a5cd9f09385113ce3e8c1376d2e5fd0a3b654ff2a17f1","preprocessing":"19746e06ebeddae21d78a29df2a3e6ff40d544b7a9f5383a925fed937a19e930","materialization":"848dcfb02b787dd0dfcd3d1f5a27d220d2958fc27be124252543b97b109f321f","train":"bc5a090c1fa5b815f72a09c1347b56418e0b3e022e27d724eb9465dd15924e54","validation":"0fd315fab802e0c3f09a454947190812e5f9f4331bb383258926b3b12aee65e7","freeze":"11036dd1961e709d77804123b3efdbafd6c083617ded6f608f674b1c0fedbc36"}
def sha(p):
 h=hashlib.sha256()
 with open(p,"rb") as f:
  while b:=f.read(8*1024*1024):h.update(b)
 return h.hexdigest()
def canonical(v):return json.dumps(v,sort_keys=True,indent=2,ensure_ascii=False,separators=(",", ": "))+"\n"
def now():return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00","Z")
def load_jsonl(p):
 with open(p,"r",encoding="utf-8") as f:return [json.loads(x) for x in f if x.strip()]
def file_records(root):return [{"filename":str(p.relative_to(root)).replace("\\","/"),"byteSize":p.stat().st_size,"sha256":sha(p)} for p in sorted(root.rglob("*")) if p.is_file()]
def require_pristine_initialization(candidate,pristine,first_run):
 candidate=Path(candidate).resolve();pristine=Path(pristine).resolve();first_run=Path(first_run).resolve()
 if candidate!=pristine or candidate==first_run or first_run in candidate.parents:raise RuntimeError("Second-run initialization must be the pristine pinned base cache; first-run weights rejected")
 return candidate
class Rows(Dataset):
 def __init__(self,items):self.items=items
 def __len__(self):return len(self.items)
 def __getitem__(self,index):return {"text":self.items[index]["text"],"label":self.items[index]["target"]}
class Collator:
 def __init__(self,tok):self.tok=tok
 def __call__(self,features):
  batch=self.tok([x["text"] for x in features],padding="longest",truncation=True,max_length=128,add_special_tokens=True,return_attention_mask=True,return_token_type_ids=False,return_tensors="pt");batch["labels"]=torch.tensor([x["label"] for x in features],dtype=torch.int64);return batch
class TieBreakCallback(TrainerCallback):
 def __init__(self):self.best=None
 def on_evaluate(self,args,state,control,metrics=None,**kwargs):
  if not metrics:return control
  current=(float(metrics["eval_macro_f1"]),float(metrics["eval_loss"]),int(round(state.epoch)))
  if self.best is not None and current[0]==self.best[0] and current[1]<self.best[1] and state.best_metric is not None:state.best_metric=current[0]-1e-12
  if self.best is None or (-current[0],current[1],current[2])<(-self.best[0],self.best[1],self.best[2]):self.best=current
  return control
def metric_values(y,p,loss):
 cm=np.zeros((2,2),dtype=np.int64)
 for actual,predicted in zip(y,p):cm[actual,predicted]+=1
 classes={}
 for index,name in enumerate(("ALLOW","BLOCK")):
  tp=cm[index,index];fp=cm[:,index].sum()-tp;fn=cm[index,:].sum()-tp;precision=float(tp/(tp+fp)) if tp+fp else 0.;recall=float(tp/(tp+fn)) if tp+fn else 0.;f1=float(2*precision*recall/(precision+recall)) if precision+recall else 0.;classes[name]={"precision":precision,"recall":recall,"f1":f1,"support":int(cm[index,:].sum())}
 return {"loss":float(loss),"accuracy":float((p==y).mean()),"macroF1":float((classes["ALLOW"]["f1"]+classes["BLOCK"]["f1"])/2),"weightedF1":float((classes["ALLOW"]["f1"]*classes["ALLOW"]["support"]+classes["BLOCK"]["f1"]*classes["BLOCK"]["support"])/len(y)),"perClass":classes,"confusionMatrix":cm.tolist(),"predictedCounts":{"ALLOW":int((p==0).sum()),"BLOCK":int((p==1).sum())}}
def trainer_metrics(pred):
 y=np.asarray(pred.label_ids,dtype=np.int64);p=np.argmax(pred.predictions,axis=1);m=metric_values(y,p,0.);return {"accuracy":m["accuracy"],"macro_f1":m["macroF1"],"weighted_f1":m["weightedF1"],"allow_precision":m["perClass"]["ALLOW"]["precision"],"allow_recall":m["perClass"]["ALLOW"]["recall"],"allow_f1":m["perClass"]["ALLOW"]["f1"],"block_precision":m["perClass"]["BLOCK"]["precision"],"block_recall":m["perClass"]["BLOCK"]["recall"],"block_f1":m["perClass"]["BLOCK"]["f1"],"cm_allow_allow":m["confusionMatrix"][0][0],"cm_allow_block":m["confusionMatrix"][0][1],"cm_block_allow":m["confusionMatrix"][1][0],"cm_block_block":m["confusionMatrix"][1][1]}
def summarize(values):
 a=np.asarray(values,dtype=np.float64);return {"count":int(a.size),"min":float(a.min()),"max":float(a.max()),"mean":float(a.mean()),"median":float(np.median(a)),"p25":float(np.quantile(a,.25,method="linear")),"p75":float(np.quantile(a,.75,method="linear"))}
def infer(model,tokenizer,rows):
 model.eval();records=[]
 with torch.inference_mode():
  for start in range(0,len(rows),8):
   items=rows[start:start+8];inputs=tokenizer([x["text"] for x in items],padding="longest",truncation=True,max_length=128,add_special_tokens=True,return_attention_mask=True,return_token_type_ids=False,return_tensors="pt");logits=model(**inputs).logits;probs=torch.softmax(logits,dim=1)
   for row,logit,prob in zip(items,logits.tolist(),probs.tolist()):
    prediction=0 if logit[0]>=logit[1] else 1;records.append({"exampleId":row["exampleId"],"target":row["target"],"trueDecision":row["decision"],"predictedTarget":prediction,"predictedDecision":"ALLOW" if prediction==0 else "BLOCK","allowLogit":float(logit[0]),"blockLogit":float(logit[1]),"blockMargin":float(logit[1]-logit[0]),"allowProbability":float(prob[0]),"blockProbability":float(prob[1])})
 y=np.asarray([x["target"] for x in records],dtype=np.int64);p=np.asarray([x["predictedTarget"] for x in records],dtype=np.int64);loss=float(np.mean([-math.log(max(x["allowProbability"] if x["target"]==0 else x["blockProbability"],1e-300)) for x in records]));metrics=metric_values(y,p,loss);distributions={name:{"blockProbability":summarize([x["blockProbability"] for x in records if x["target"]==target]),"blockMargin":summarize([x["blockMargin"] for x in records if x["target"]==target])} for target,name in ((0,"trueALLOW"),(1,"trueBLOCK"))};return {"metrics":metrics,"trueClassDistributions":distributions,"predictionDiagnostics":records}
def main():
 backend=Path(__file__).resolve().parents[4];mhs=backend/"dataset-research/text-moderation/MEASURING_HATE_SPEECH";training=mhs/"training";materialized=mhs/"materialized";pristine=backend/f"evaluation-cache/text-moderation/classifier/facebookai-xlm-roberta-base/{REVISION}";first_root=backend/"evaluation-cache/text-moderation/classifier-training/mhs-xlm-roberta-first-run-v1";out=backend/"evaluation-cache/text-moderation/classifier-training/mhs-xlm-roberta-second-run-v1";manifest_path=training/"mhs-xlm-roberta-second-training-run-v1.json"
 if any(x.startswith("--check-initialization-path=") for x in sys.argv):
  candidate=next(x.split("=",1)[1] for x in sys.argv if x.startswith("--check-initialization-path="));require_pristine_initialization(candidate,pristine,first_root);print("PRISTINE_INITIALIZATION_ACCEPTED");return
 if out.exists() or manifest_path.exists():raise RuntimeError("Second training run already exists; another run refused")
 paths={"second_config":training/"mhs-xlm-roberta-second-training-config-v1.json","first_run":training/"mhs-xlm-roberta-first-training-run-v1.json","assessment":training/"mhs-xlm-roberta-first-run-validation-assessment-v1.json","classifier":backend/"dataset-research/text-moderation/model-authority/xlm-roberta-base-classifier-authority-v1.json","preprocessing":mhs/"preprocessing/mhs-xlm-roberta-preprocessing-contract-v1.json","materialization":materialized/"mhs-materialization-manifest-v1.json","train":materialized/"mhs-train-v1.jsonl","validation":materialized/"mhs-validation-v1.jsonl","freeze":mhs/"splits/mhs-internal-test-freeze-v1.json"}
 for name,p in paths.items():
  if sha(p)!=EXPECTED[name]:raise RuntimeError(f"Second-run preflight SHA mismatch: {name}")
 initialization=require_pristine_initialization(pristine,pristine,first_root);weight=initialization/"model.safetensors"
 if weight.stat().st_size!=1115567652 or sha(weight)!=BASE_WEIGHT_SHA:raise RuntimeError("Pristine base-weight identity mismatch")
 versions={"python":platform.python_version(),"transformers":transformers.__version__,"pytorch":torch.__version__,"accelerate":accelerate.__version__,"tokenizers":tokenizers.__version__,"sentencepiece":sentencepiece.__version__,"safetensors":safetensors.__version__,"numpy":np.__version__};expected_versions={"python":"3.12.10","transformers":"4.42.4","pytorch":"2.3.1+cpu","accelerate":"0.31.0","tokenizers":"0.19.1","sentencepiece":"0.2.0","safetensors":"0.4.3","numpy":"1.26.4"}
 if versions!=expected_versions or torch.cuda.is_available():raise RuntimeError(f"Toolchain/CPU preflight mismatch: {versions}")
 train=load_jsonl(paths["train"]);validation=load_jsonl(paths["validation"])
 if len(train)!=60 or len(validation)!=13 or math.ceil(len(train)/8)*5!=40:raise RuntimeError("Population/step preflight mismatch")
 random.seed(SEED);np.random.seed(SEED);torch.manual_seed(SEED);set_seed(SEED);torch.use_deterministic_algorithms(True,warn_only=False);torch.backends.cudnn.deterministic=True;torch.backends.cudnn.benchmark=False;torch.backends.cuda.matmul.allow_tf32=False
 if "--preflight-only" in sys.argv:
  tokenizer=AutoTokenizer.from_pretrained(initialization,local_files_only=True,use_fast=True);config=AutoConfig.from_pretrained(initialization,local_files_only=True,num_labels=2,label2id={"ALLOW":0,"BLOCK":1},id2label={0:"ALLOW",1:"BLOCK"},hidden_dropout_prob=.1,attention_probs_dropout_prob=.1,classifier_dropout=.1);model=AutoModelForSequenceClassification.from_pretrained(initialization,config=config,local_files_only=True,use_safetensors=True)
  if next(model.parameters()).device.type!="cpu" or model.num_labels!=2:raise RuntimeError("Pristine model preflight mismatch")
  print(canonical({"status":"PREFLIGHT_PASSED","initialization":"PRISTINE_PINNED_BASE","baseWeightSha256":BASE_WEIGHT_SHA,"trainRows":60,"validationRows":13,"epochs":5,"optimizerSteps":40,"schedulerSteps":40,"warmupSteps":2,"seed":SEED,"device":"cpu","optimizerCreated":False,"trainingStarted":False,"writesPerformed":False,"toolchain":versions}));return
 started=now();out.mkdir(parents=True);(out/"checkpoints").mkdir();(out/"final").mkdir();(out/"logs").mkdir();(out/"temporary").mkdir();(out/"run").mkdir()
 try:
  tokenizer=AutoTokenizer.from_pretrained(initialization,local_files_only=True,use_fast=True);config=AutoConfig.from_pretrained(initialization,local_files_only=True,num_labels=2,label2id={"ALLOW":0,"BLOCK":1},id2label={0:"ALLOW",1:"BLOCK"},hidden_dropout_prob=.1,attention_probs_dropout_prob=.1,classifier_dropout=.1);model=AutoModelForSequenceClassification.from_pretrained(initialization,config=config,local_files_only=True,use_safetensors=True)
  args=TrainingArguments(output_dir=str(out/"checkpoints"),overwrite_output_dir=False,num_train_epochs=5,per_device_train_batch_size=8,per_device_eval_batch_size=8,gradient_accumulation_steps=1,learning_rate=2e-5,weight_decay=.01,adam_beta1=.9,adam_beta2=.999,adam_epsilon=1e-8,max_grad_norm=1.,lr_scheduler_type="linear",warmup_steps=2,evaluation_strategy="epoch",save_strategy="epoch",logging_strategy="epoch",save_total_limit=2,load_best_model_at_end=True,metric_for_best_model="macro_f1",greater_is_better=True,seed=SEED,data_seed=SEED,dataloader_num_workers=0,use_cpu=True,fp16=False,bf16=False,tf32=False,full_determinism=True,remove_unused_columns=False,report_to=[],optim="adamw_torch",save_safetensors=True)
  trainer=Trainer(model=model,args=args,train_dataset=Rows(train),eval_dataset=Rows(validation),data_collator=Collator(tokenizer),compute_metrics=trainer_metrics,callbacks=[TieBreakCallback()]);result=trainer.train();epochs=[]
  for row in trainer.state.log_history:
   if "eval_macro_f1" in row:epochs.append({"epoch":int(round(row["epoch"])),"globalStep":int(row["step"]),"validationLoss":row["eval_loss"],"accuracy":row["eval_accuracy"],"macroF1":row["eval_macro_f1"],"weightedF1":row["eval_weighted_f1"],"perClass":{"ALLOW":{"precision":row["eval_allow_precision"],"recall":row["eval_allow_recall"],"f1":row["eval_allow_f1"]},"BLOCK":{"precision":row["eval_block_precision"],"recall":row["eval_block_recall"],"f1":row["eval_block_f1"]}},"confusionMatrix":[[int(row["eval_cm_allow_allow"]),int(row["eval_cm_allow_block"])],[int(row["eval_cm_block_allow"]),int(row["eval_cm_block_block"])]]})
  if trainer.state.global_step!=40 or len(epochs)!=5 or [x["globalStep"] for x in epochs]!=[8,16,24,32,40]:raise RuntimeError("Second-run runtime accounting diverged")
  best=sorted(epochs,key=lambda x:(-x["macroF1"],x["validationLoss"],x["epoch"]))[0];selected=out/"checkpoints"/f"checkpoint-{best['globalStep']}"
  if not selected.exists():raise RuntimeError("Selected second-run checkpoint was not retained")
  retained=[]
  for directory in sorted((out/"checkpoints").glob("checkpoint-*")):
   step=int(directory.name.split("-")[-1]);epoch=step//8;target=out/"checkpoints"/f"checkpoint-epoch-{epoch:02d}";directory.rename(target);retained.append({"epoch":epoch,"globalStep":step,"path":str(target.relative_to(out)).replace("\\","/"),"files":file_records(target)})
  selected=out/"checkpoints"/f"checkpoint-epoch-{best['epoch']:02d}";final_model=AutoModelForSequenceClassification.from_pretrained(selected,local_files_only=True,use_safetensors=True);final_model.save_pretrained(out/"final",safe_serialization=True);binding={"repository":"FacebookAI/xlm-roberta-base","revision":REVISION,"tokenizerArtifactSha256":"a898ea75433890f6610f4e470b8ebeb0c21dce5c8dd61f892eb09eb5919d2e2c","preprocessingContractSha256":EXPECTED["preprocessing"]};(out/"final"/"tokenizer-binding.json").write_bytes(canonical(binding).encode("utf-8"));final_model=AutoModelForSequenceClassification.from_pretrained(out/"final",local_files_only=True,use_safetensors=True);train_final=infer(final_model,tokenizer,train);validation_final=infer(final_model,tokenizer,validation)
  minimum=train_final["metrics"]["predictedCounts"]["BLOCK"]>0 and train_final["metrics"]["perClass"]["BLOCK"]["recall"]>0 and train_final["metrics"]["macroF1"]>.4;all_block=train_final["metrics"]["predictedCounts"]["BLOCK"]==60 or validation_final["metrics"]["predictedCounts"]["BLOCK"]==13;stronger=minimum and validation_final["metrics"]["confusionMatrix"][1][1]>=1 and validation_final["metrics"]["macroF1"]>.40909090909090906 and not all_block
  if all_block:interpretation="CASE_4_ALL_BLOCK_COLLAPSE"
  elif train_final["metrics"]["perClass"]["BLOCK"]["recall"]==0:interpretation="CASE_1_NO_TRAIN_BLOCK_LEARNING"
  elif validation_final["metrics"]["perClass"]["BLOCK"]["recall"]==0:interpretation="CASE_2_TRAIN_LEARNING_NO_VALIDATION_BLOCK_GENERALIZATION"
  else:interpretation="CASE_3_TRAIN_AND_VALIDATION_DISCRIMINATION_IMPROVED"
  assessment=json.loads(paths["assessment"].read_text(encoding="utf-8"));first_train=assessment["train"]["metrics"];first_validation=assessment["validation"]["metrics"];comparison={"first":{"epochs":3,"optimizerSteps":24,"trainMacroF1":first_train["macroF1"],"trainBlockRecall":first_train["perClass"]["BLOCK"]["recall"],"trainPredictedBlockCount":first_train["predictedCounts"]["BLOCK"],"validationMacroF1":first_validation["macroF1"],"validationBlockRecall":first_validation["perClass"]["BLOCK"]["recall"],"validationPredictedBlockCount":first_validation["predictedCounts"]["BLOCK"],"validationLoss":first_validation["loss"],"bestEpoch":3},"second":{"epochs":5,"optimizerSteps":40,"trainMacroF1":train_final["metrics"]["macroF1"],"trainBlockRecall":train_final["metrics"]["perClass"]["BLOCK"]["recall"],"trainPredictedBlockCount":train_final["metrics"]["predictedCounts"]["BLOCK"],"validationMacroF1":validation_final["metrics"]["macroF1"],"validationBlockRecall":validation_final["metrics"]["perClass"]["BLOCK"]["recall"],"validationPredictedBlockCount":validation_final["metrics"]["predictedCounts"]["BLOCK"],"validationLoss":validation_final["metrics"]["loss"],"bestEpoch":best["epoch"]}}
  ended=now();payload={"schemaVersion":"STHN_TEXT_MODERATION_MHS_SECOND_TRAINING_RUN_V1","runVersion":"MHS_XLM_ROBERTA_SECOND_TRAINING_RUN_V1","terminalStatus":"COMPLETED","authorities":{"secondConfigSha256":EXPECTED["second_config"],"firstRunManifestSha256":EXPECTED["first_run"],"firstRunAssessmentSha256":EXPECTED["assessment"],"classifierAuthoritySha256":EXPECTED["classifier"],"preprocessingContractSha256":EXPECTED["preprocessing"],"materializationManifestSha256":EXPECTED["materialization"],"trainSha256":EXPECTED["train"],"validationSha256":EXPECTED["validation"]},"cleanInitialization":{"source":"PRISTINE_PINNED_BASE_XLM_ROBERTA","repository":"FacebookAI/xlm-roberta-base","revision":REVISION,"baseWeightFilename":"model.safetensors","baseWeightByteSize":weight.stat().st_size,"baseWeightSha256":BASE_WEIGHT_SHA,"firstRunFinalUsed":False,"firstRunCheckpointUsed":False},"toolchain":versions,"hardware":{"device":"cpu","cudaVisibleDevices":"","cudaAvailable":False,"cpu":platform.processor() or os.environ.get("PROCESSOR_IDENTIFIER","unknown"),"logicalProcessors":psutil.cpu_count(logical=True),"physicalCores":psutil.cpu_count(logical=False),"totalRamBytes":psutil.virtual_memory().total,"os":platform.platform()},"seed":SEED,"configuration":{"epochs":5,"optimizer":"AdamW","learningRate":2e-5,"betas":[.9,.999],"epsilon":1e-8,"weightDecay":.01,"loss":"CROSS_ENTROPY_TWO_LOGITS","classWeighting":"NONE","oversampling":False,"trainBatchSize":8,"validationBatchSize":8,"gradientAccumulation":1,"maxGradNorm":1.,"scheduler":"linear","warmupSteps":2,"precision":"FP32","decisionRule":"ARGMAX_LOGITS","evaluationCadence":"ONCE_PER_EPOCH","checkpointCadence":"ONCE_PER_EPOCH","checkpointRetention":2},"steps":{"batchesPerEpoch":8,"optimizerStepsPerEpoch":8,"totalOptimizerSteps":40,"schedulerSteps":40},"epochs":epochs,"checkpointHistory":[{"epoch":e,"globalStep":e*8,"logicalName":f"checkpoint-epoch-{e:02d}","retained":any(x["epoch"]==e for x in retained)} for e in range(1,6)],"retainedCheckpoints":retained,"bestCheckpoint":{"epoch":best["epoch"],"globalStep":best["globalStep"],"macroF1":best["macroF1"],"validationLoss":best["validationLoss"],"path":str(selected.relative_to(out)).replace("\\","/")},"tieBreakRule":["HIGHER_MACRO_F1","LOWER_VALIDATION_LOSS","EARLIER_EPOCH"],"tieBreakUsed":sum(x["macroF1"]==best["macroF1"] for x in epochs)>1,"finalExport":{"sourceCheckpoint":str(selected.relative_to(out)).replace("\\","/"),"path":"final","files":file_records(out/"final")},"finalTrain":train_final,"finalValidation":validation_final,"firstVsSecondComparison":comparison,"criteria":{"minimumSuccess":minimum,"strongerEvidence":stronger,"minimumDefinition":["TRAIN_PREDICTED_BLOCK_COUNT_GT_ZERO","TRAIN_BLOCK_RECALL_GT_ZERO","TRAIN_MACRO_F1_GT_0_4"],"strongerDefinition":["MINIMUM_SUCCESS","VALIDATION_TRUE_BLOCK_CORRECT_COUNT_GTE_1","VALIDATION_MACRO_F1_GT_0_40909090909090906","NO_ALL_BLOCK_COLLAPSE"]},"interpretationCase":interpretation,"training":{"startedAt":started,"endedAt":ended,"trainRuntimeSeconds":result.metrics["train_runtime"]},"runCount":1,"protectedDataExclusion":{"internalTestAccessed":False,"frozen140Accessed":False,"monolithicCandidateAccessed":False,"onlyTrainValidationTextUsed":True,"persistentTokenizedDataset":False},"thresholdCalibrationPerformed":False,"hyperparameterSearchPerformed":False,"thirdRunCreated":False,"productionIntegrationPerformed":False}
  payload["runPayloadDigest"]=hashlib.sha256(canonical(payload).encode("utf-8")).hexdigest();manifest_path.write_bytes(canonical(payload).encode("utf-8"));print(canonical({"manifest":str(manifest_path),"manifestSha256":sha(manifest_path),"payloadDigest":payload["runPayloadDigest"],"bestCheckpoint":payload["bestCheckpoint"],"minimumSuccess":minimum,"strongerEvidence":stronger,"interpretationCase":interpretation,"trainMetrics":train_final["metrics"],"validationMetrics":validation_final["metrics"]}))
 except Exception as error:
  (out/"run"/"failure.json").write_bytes(canonical({"status":"FAILED","errorType":type(error).__name__,"message":str(error),"failedAt":now()}).encode("utf-8"));raise
if __name__=="__main__":main()
