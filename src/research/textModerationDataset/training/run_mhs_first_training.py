import hashlib,json,math,os,platform,random,shutil,sys,time
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
WEIGHT_SHA="6fd4797bc397c3b8b55d6bb5740366b57e6a3ce91c04c77f22aafc0c128e6feb"
EXPECTED={"training_config":"18e6f8d712881980dacf2ba954a5849312175126036d81a6786b6b041c6c9dff","classifier":"ca9cd876c9facd4b310a5cd9f09385113ce3e8c1376d2e5fd0a3b654ff2a17f1","preprocessing":"19746e06ebeddae21d78a29df2a3e6ff40d544b7a9f5383a925fed937a19e930","materialization":"848dcfb02b787dd0dfcd3d1f5a27d220d2958fc27be124252543b97b109f321f","train":"bc5a090c1fa5b815f72a09c1347b56418e0b3e022e27d724eb9465dd15924e54","validation":"0fd315fab802e0c3f09a454947190812e5f9f4331bb383258926b3b12aee65e7","release":"d318d6ec929477beb77f624b47bd09280498a0d0e20426c89dfd1c0620034d96","eligibility":"2a7b930123607fdf14dd18be6c03f2976ab3d7e23977158e2a9a255214b97322","freeze":"11036dd1961e709d77804123b3efdbafd6c083617ded6f608f674b1c0fedbc36"}
def sha(p):
 h=hashlib.sha256()
 with open(p,"rb") as f:
  while b:=f.read(8*1024*1024):h.update(b)
 return h.hexdigest()
def canonical(v):return json.dumps(v,sort_keys=True,indent=2,ensure_ascii=False,separators=(",", ": "))+"\n"
def now():return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00","Z")
def file_records(root):
 return [{"filename":str(p.relative_to(root)).replace("\\","/"),"byteSize":p.stat().st_size,"sha256":sha(p)} for p in sorted(root.rglob("*")) if p.is_file()]
def load_jsonl(p):
 with open(p,"r",encoding="utf-8") as f:return [json.loads(x) for x in f if x.strip()]
class Rows(Dataset):
 def __init__(self,rows):self.rows=rows
 def __len__(self):return len(self.rows)
 def __getitem__(self,i):return {"text":self.rows[i]["text"],"label":self.rows[i]["target"]}
class Collator:
 def __init__(self,tok):self.tok=tok
 def __call__(self,features):
  batch=self.tok([x["text"] for x in features],padding="longest",truncation=True,max_length=128,add_special_tokens=True,return_attention_mask=True,return_token_type_ids=False,return_tensors="pt")
  batch["labels"]=torch.tensor([x["label"] for x in features],dtype=torch.int64);return batch
class TieBreakCallback(TrainerCallback):
 def __init__(self):self.best=None
 def on_evaluate(self,args,state,control,metrics=None,**kwargs):
  if not metrics:return control
  current=(float(metrics["eval_macro_f1"]),float(metrics["eval_loss"]),int(round(state.epoch)))
  if self.best is not None and current[0]==self.best[0] and current[1]<self.best[1] and state.best_metric is not None:
   state.best_metric=current[0]-1e-12
  if self.best is None or (-current[0],current[1],current[2])<(-self.best[0],self.best[1],self.best[2]):self.best=current
  return control
def metrics(pred):
 y=np.asarray(pred.label_ids,dtype=np.int64);p=np.argmax(pred.predictions,axis=1);cm=np.zeros((2,2),dtype=np.int64)
 for a,b in zip(y,p):cm[a,b]+=1
 out=[]
 for c in (0,1):
  tp=cm[c,c];fp=cm[:,c].sum()-tp;fn=cm[c,:].sum()-tp;precision=float(tp/(tp+fp)) if tp+fp else 0.;recall=float(tp/(tp+fn)) if tp+fn else 0.;f1=float(2*precision*recall/(precision+recall)) if precision+recall else 0.;out.append((precision,recall,f1,int(cm[c,:].sum())))
 macro=sum(x[2] for x in out)/2;weighted=sum(x[2]*x[3] for x in out)/len(y)
 return {"accuracy":float((p==y).mean()),"macro_f1":macro,"weighted_f1":weighted,"allow_precision":out[0][0],"allow_recall":out[0][1],"allow_f1":out[0][2],"block_precision":out[1][0],"block_recall":out[1][1],"block_f1":out[1][2],"cm_allow_allow":int(cm[0,0]),"cm_allow_block":int(cm[0,1]),"cm_block_allow":int(cm[1,0]),"cm_block_block":int(cm[1,1])}
def main():
 backend=Path(__file__).resolve().parents[4];mhs=backend/"dataset-research/text-moderation/MEASURING_HATE_SPEECH";mat=mhs/"materialized";training=mhs/"training";cache=backend/f"evaluation-cache/text-moderation/classifier/facebookai-xlm-roberta-base/{REVISION}";out=backend/"evaluation-cache/text-moderation/classifier-training/mhs-xlm-roberta-first-run-v1";manifest_path=training/"mhs-xlm-roberta-first-training-run-v1.json"
 paths={"training_config":training/"mhs-xlm-roberta-first-training-config-v1.json","classifier":backend/"dataset-research/text-moderation/model-authority/xlm-roberta-base-classifier-authority-v1.json","preprocessing":mhs/"preprocessing/mhs-xlm-roberta-preprocessing-contract-v1.json","materialization":mat/"mhs-materialization-manifest-v1.json","train":mat/"mhs-train-v1.jsonl","validation":mat/"mhs-validation-v1.jsonl","release":mhs/"release/mhs-release-manifest-v1.json","eligibility":mhs/"release/mhs-training-eligibility-manifest-v1.json","freeze":mhs/"splits/mhs-internal-test-freeze-v1.json"}
 if out.exists() or manifest_path.exists():raise RuntimeError("Run already exists; second training run refused")
 for k,p in paths.items():
  if sha(p)!=EXPECTED[k]:raise RuntimeError(f"Preflight SHA mismatch: {k}")
 weight=cache/"model.safetensors"
 if weight.stat().st_size!=1115567652 or sha(weight)!=WEIGHT_SHA:raise RuntimeError("Pinned base-weight identity mismatch")
 versions={"python":platform.python_version(),"transformers":transformers.__version__,"pytorch":torch.__version__,"accelerate":accelerate.__version__,"tokenizers":tokenizers.__version__,"sentencepiece":sentencepiece.__version__,"safetensors":safetensors.__version__,"numpy":np.__version__}
 expected_versions={"python":"3.12.10","transformers":"4.42.4","pytorch":"2.3.1+cpu","accelerate":"0.31.0","tokenizers":"0.19.1","sentencepiece":"0.2.0","safetensors":"0.4.3","numpy":"1.26.4"}
 if versions!=expected_versions or torch.cuda.is_available():raise RuntimeError(f"Toolchain/CPU preflight mismatch: {versions}")
 train=load_jsonl(paths["train"]);valid=load_jsonl(paths["validation"])
 if len(train)!=60 or len(valid)!=13 or any(x["target"] not in (0,1) for x in train+valid):raise RuntimeError("Dataset preflight mismatch")
 random.seed(SEED);np.random.seed(SEED);torch.manual_seed(SEED);set_seed(SEED);torch.use_deterministic_algorithms(True,warn_only=False);torch.backends.cudnn.deterministic=True;torch.backends.cudnn.benchmark=False;torch.backends.cuda.matmul.allow_tf32=False
 if "--preflight-only" in sys.argv:
  tokenizer=AutoTokenizer.from_pretrained(cache,local_files_only=True,use_fast=True)
  config=AutoConfig.from_pretrained(cache,local_files_only=True,num_labels=2,label2id={"ALLOW":0,"BLOCK":1},id2label={0:"ALLOW",1:"BLOCK"},hidden_dropout_prob=.1,attention_probs_dropout_prob=.1,classifier_dropout=.1)
  model=AutoModelForSequenceClassification.from_pretrained(cache,config=config,local_files_only=True,use_safetensors=True)
  if model.num_labels!=2 or next(model.parameters()).device.type!="cpu" or tokenizer.model_max_length<128:raise RuntimeError("Pinned local model/tokenizer preflight mismatch")
  print(canonical({"status":"PREFLIGHT_PASSED","writesPerformed":False,"optimizerCreated":False,"trainingStarted":False,"baseWeightSha256":WEIGHT_SHA,"trainRows":len(train),"validationRows":len(valid),"batchesPerEpoch":math.ceil(len(train)/8),"totalOptimizerSteps":math.ceil(len(train)/8)*3,"device":"cpu","toolchain":versions}))
  return
 started=now();out.mkdir(parents=True);(out/"run").mkdir();(out/"checkpoints").mkdir();(out/"final").mkdir();(out/"logs").mkdir();(out/"temporary").mkdir()
 try:
  tokenizer=AutoTokenizer.from_pretrained(cache,local_files_only=True,use_fast=True);config=AutoConfig.from_pretrained(cache,local_files_only=True,num_labels=2,label2id={"ALLOW":0,"BLOCK":1},id2label={0:"ALLOW",1:"BLOCK"},hidden_dropout_prob=.1,attention_probs_dropout_prob=.1,classifier_dropout=.1);model=AutoModelForSequenceClassification.from_pretrained(cache,config=config,local_files_only=True,use_safetensors=True)
  args=TrainingArguments(output_dir=str(out/"checkpoints"),overwrite_output_dir=False,num_train_epochs=3,per_device_train_batch_size=8,per_device_eval_batch_size=8,gradient_accumulation_steps=1,learning_rate=2e-5,weight_decay=.01,adam_beta1=.9,adam_beta2=.999,adam_epsilon=1e-8,max_grad_norm=1.,lr_scheduler_type="linear",warmup_steps=2,evaluation_strategy="epoch",save_strategy="epoch",logging_strategy="epoch",save_total_limit=2,load_best_model_at_end=True,metric_for_best_model="macro_f1",greater_is_better=True,seed=SEED,data_seed=SEED,dataloader_num_workers=0,use_cpu=True,fp16=False,bf16=False,tf32=False,full_determinism=True,remove_unused_columns=False,report_to=[],optim="adamw_torch",save_safetensors=True)
  trainer=Trainer(model=model,args=args,train_dataset=Rows(train),eval_dataset=Rows(valid),data_collator=Collator(tokenizer),compute_metrics=metrics,callbacks=[TieBreakCallback()])
  if math.ceil(len(train)/8)*3!=24:raise RuntimeError("Step preflight mismatch")
  result=trainer.train()
  epochs=[]
  for row in trainer.state.log_history:
   if "eval_macro_f1" in row:
    epochs.append({"epoch":int(round(row["epoch"])),"globalStep":int(row["step"]),"validationLoss":row["eval_loss"],"accuracy":row["eval_accuracy"],"macroF1":row["eval_macro_f1"],"weightedF1":row["eval_weighted_f1"],"perClass":{"ALLOW":{"precision":row["eval_allow_precision"],"recall":row["eval_allow_recall"],"f1":row["eval_allow_f1"]},"BLOCK":{"precision":row["eval_block_precision"],"recall":row["eval_block_recall"],"f1":row["eval_block_f1"]}},"confusionMatrix":[[int(row["eval_cm_allow_allow"]),int(row["eval_cm_allow_block"])],[int(row["eval_cm_block_allow"]),int(row["eval_cm_block_block"])]]})
  if trainer.state.global_step!=24 or len(epochs)!=3 or [e["globalStep"] for e in epochs]!=[8,16,24]:raise RuntimeError("Runtime step/evaluation accounting diverged")
  best=sorted(epochs,key=lambda e:(-e["macroF1"],e["validationLoss"],e["epoch"]))[0];selected=out/"checkpoints"/f"checkpoint-{best['globalStep']}"
  if not selected.exists():raise RuntimeError("Objectively selected checkpoint was not retained")
  retained=[]
  for d in sorted((out/"checkpoints").glob("checkpoint-*")):
   step=int(d.name.split("-")[-1]);epoch=step//8;target=out/"checkpoints"/f"checkpoint-epoch-{epoch:02d}";d.rename(target);retained.append({"epoch":epoch,"globalStep":step,"path":str(target.relative_to(out)).replace("\\","/"),"files":file_records(target)})
  selected=out/"checkpoints"/f"checkpoint-epoch-{best['epoch']:02d}";final_model=AutoModelForSequenceClassification.from_pretrained(selected,local_files_only=True,use_safetensors=True);final_model.save_pretrained(out/"final",safe_serialization=True);binding={"repository":"FacebookAI/xlm-roberta-base","revision":REVISION,"tokenizerArtifactSha256":"a898ea75433890f6610f4e470b8ebeb0c21dce5c8dd61f892eb09eb5919d2e2c","preprocessingContractSha256":EXPECTED["preprocessing"]};(out/"final"/"tokenizer-binding.json").write_text(canonical(binding),encoding="utf-8")
  ended=now();payload={"schemaVersion":"STHN_TEXT_MODERATION_MHS_FIRST_TRAINING_RUN_V1","runVersion":"MHS_XLM_ROBERTA_FIRST_TRAINING_RUN_V1","terminalStatus":"COMPLETED","authorities":{"trainingConfigSha256":EXPECTED["training_config"],"classifierAuthoritySha256":EXPECTED["classifier"],"preprocessingContractSha256":EXPECTED["preprocessing"],"materializationManifestSha256":EXPECTED["materialization"],"trainSha256":EXPECTED["train"],"validationSha256":EXPECTED["validation"]},"baseWeight":{"filename":"model.safetensors","byteSize":weight.stat().st_size,"sha256":WEIGHT_SHA,"repository":"FacebookAI/xlm-roberta-base","revision":REVISION},"toolchain":versions,"hardware":{"device":"cpu","cudaVisibleDevices":"","cudaAvailable":False,"cpu":platform.processor() or os.environ.get("PROCESSOR_IDENTIFIER","unknown"),"logicalProcessors":psutil.cpu_count(logical=True),"physicalCores":psutil.cpu_count(logical=False),"totalRamBytes":psutil.virtual_memory().total,"os":platform.platform()},"seed":{"string":"STHN_T6L_7C_FIRST_TRAINING_RUN_V1","integer":SEED},"configuration":{"optimizer":"AdamW","learningRate":2e-5,"betas":[.9,.999],"epsilon":1e-8,"weightDecay":.01,"epochs":3,"trainBatchSize":8,"validationBatchSize":8,"gradientAccumulation":1,"maxGradNorm":1.,"scheduler":"linear","warmupSteps":2,"precision":"FP32","decisionRule":"ARGMAX_LOGITS"},"steps":{"batchesPerEpoch":8,"optimizerStepsPerEpoch":8,"totalOptimizerSteps":24,"schedulerSteps":24},"epochs":epochs,"checkpointHistory":[{"epoch":e,"globalStep":e*8,"logicalName":f"checkpoint-epoch-{e:02d}","retained":any(x["epoch"]==e for x in retained)} for e in (1,2,3)],"retainedCheckpoints":retained,"bestCheckpoint":{"epoch":best["epoch"],"globalStep":best["globalStep"],"macroF1":best["macroF1"],"validationLoss":best["validationLoss"],"path":str(selected.relative_to(out)).replace("\\","/")},"tieBreakRule":["HIGHER_MACRO_F1","LOWER_VALIDATION_LOSS","EARLIER_EPOCH"],"tieBreakUsed":sum(e["macroF1"]==best["macroF1"] for e in epochs)>1,"finalExport":{"sourceCheckpoint":str(selected.relative_to(out)).replace("\\","/"),"path":"final","files":file_records(out/"final")},"training":{"startedAt":started,"endedAt":ended,"trainRuntimeSeconds":result.metrics["train_runtime"]},"protectedDataExclusion":{"internalTestAccessed":False,"frozen140Accessed":False,"monolithicCandidateAccessed":False,"developmentProjectionAccessed":False,"onlyTrainValidationTextUsed":True,"persistentTokenizedDataset":False},"thresholdCalibrationPerformed":False,"hyperparameterSearchPerformed":False,"runCount":1}
  payload["runPayloadDigest"]=hashlib.sha256(canonical(payload).encode()).hexdigest();text=canonical(payload);manifest_path.write_text(text,encoding="utf-8");print(canonical({"manifest":str(manifest_path),"manifestSha256":sha(manifest_path),"best":payload["bestCheckpoint"],"runtimeSeconds":payload["training"]["trainRuntimeSeconds"]}))
 except Exception as e:
  (out/"run"/"failure.json").write_text(canonical({"status":"FAILED","errorType":type(e).__name__,"message":str(e),"failedAt":now()}),encoding="utf-8");raise
if __name__=="__main__":main()
