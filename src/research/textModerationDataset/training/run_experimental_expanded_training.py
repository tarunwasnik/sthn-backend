"""Local-only one-epoch expanded-data XLM-R experiment; never alters the historical successor run."""
import argparse, hashlib, json, math, os, random, shutil, sys
from pathlib import Path

os.environ["CUDA_VISIBLE_DEVICES"] = ""
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"

from mhs_v2_successor_model import AUXILIARY_WEIGHT, CATEGORY_TO_ID, build_successor_model_class

ROOT = Path(__file__).resolve().parents[4]
CORPUS = ROOT / "dataset-research/text-moderation/experimental-expanded-training-v1"
TRAIN, VALIDATION = CORPUS / "train.jsonl", CORPUS / "validation.jsonl"
EXPECTED = {"train": "c0592b9cbfc4ed67276115f1cce2a8015da457df4fb2104d3d3f69bab65d7e63", "validation": "329d96fa300c9b0baf13bf378874001d5a13c76b0a3d1e717b9d0410b3430a7e"}
MODEL_ID, REVISION, SEED, BATCH, EPOCHS, MAX_LENGTH = "FacebookAI/xlm-roberta-base", "e73636d4f797dec63c3081bb6ed5c7b0bb3f2089", 926509953, 8, 1, 160
OUTPUT = ROOT / "evaluation-cache/text-moderation/classifier-training/experimental-expanded-training-v1"
CACHE = ROOT / f"evaluation-cache/text-moderation/classifier/facebookai-xlm-roberta-base/{REVISION}"

def sha(p):
 d=hashlib.sha256()
 with open(p,"rb") as f:
  while b:=f.read(8*1024*1024): d.update(b)
 return d.hexdigest()
def canonical(v): return json.dumps(v,sort_keys=True,indent=2,ensure_ascii=False)+"\n"
def rows(p, expected_rows, expected_sha):
 if sha(p)!=expected_sha: raise RuntimeError("corpus SHA-256 mismatch")
 raw=p.read_text(encoding="utf8")
 if not raw.endswith("\n"): raise RuntimeError("malformed JSONL")
 value=[json.loads(line) for line in raw[:-1].split("\n") if line]
 if len(value)!=expected_rows: raise RuntimeError("corpus row count mismatch")
 for r in value:
  c=r.get("primaryCategory"); t=r.get("target")
  if not isinstance(r.get("text"),str) or not r["text"].strip() or t not in (0,1) or (t==0 and c is not None) or (t==1 and c is not None and c not in CATEGORY_TO_ID): raise RuntimeError("corpus row schema mismatch")
  r["auxiliaryTarget"],r["auxiliaryMask"]=(CATEGORY_TO_ID[c],1) if t==1 and c is not None else (0,0)
 return value
def preflight():
 train,validation=rows(TRAIN,12900,EXPECTED["train"]),rows(VALIDATION,1433,EXPECTED["validation"])
 geometry={"trainBatchesPerEpoch":math.ceil(len(train)/BATCH),"validationBatches":math.ceil(len(validation)/BATCH),"totalOptimizerSteps":math.ceil(len(train)/BATCH)*EPOCHS}
 if geometry!={"trainBatchesPerEpoch":1613,"validationBatches":180,"totalOptimizerSteps":1613}: raise RuntimeError("geometry mismatch")
 return train,validation,geometry
def execute(train,validation,geometry):
 import numpy as np, torch
 from torch.utils.data import Dataset
 from transformers import AutoConfig,AutoTokenizer,Trainer,TrainingArguments,set_seed
 if torch.cuda.is_available(): raise RuntimeError("CPU-only runner")
 if OUTPUT.exists(): raise RuntimeError("output exists; overwrite refused")
 class Data(Dataset):
  def __init__(self,x): self.x=x
  def __len__(self): return len(self.x)
  def __getitem__(self,i): return self.x[i]
 def collate(x):
  b=tokenizer([r["text"] for r in x],padding="longest",truncation=True,max_length=MAX_LENGTH,return_tensors="pt")
  b["labels"]=torch.tensor([r["target"] for r in x]);b["auxiliary_labels"]=torch.tensor([r["auxiliaryTarget"] for r in x]);b["auxiliary_mask"]=torch.tensor([r["auxiliaryMask"] for r in x],dtype=torch.bool);return b
 random.seed(SEED);np.random.seed(SEED);torch.manual_seed(SEED);set_seed(SEED);torch.use_deterministic_algorithms(True)
 tokenizer=AutoTokenizer.from_pretrained(CACHE,local_files_only=True,use_fast=True); config=AutoConfig.from_pretrained(CACHE,local_files_only=True,num_labels=2)
 model=build_successor_model_class().from_pretrained(CACHE,config=config,local_files_only=True,use_safetensors=True).reset_task_heads(SEED)
 args=TrainingArguments(output_dir=str(OUTPUT/"checkpoints"),num_train_epochs=EPOCHS,per_device_train_batch_size=BATCH,per_device_eval_batch_size=BATCH,learning_rate=2e-5,weight_decay=.01,adam_beta1=.9,adam_beta2=.999,adam_epsilon=1e-8,max_grad_norm=1.0,lr_scheduler_type="linear",warmup_steps=2,evaluation_strategy="epoch",save_strategy="epoch",save_total_limit=1,use_cpu=True,fp16=False,bf16=False,tf32=False,full_determinism=True,remove_unused_columns=False,label_names=["labels"],report_to=[],optim="adamw_torch",save_safetensors=True)
 trainer=Trainer(model=model,args=args,train_dataset=Data(train),eval_dataset=Data(validation),data_collator=collate);trainer.train();metrics=trainer.evaluate();(OUTPUT/"final").mkdir(parents=True,exist_ok=False);model.save_pretrained(OUTPUT/"final",safe_serialization=True);tokenizer.save_pretrained(OUTPUT/"final")
 manifest={"corpusVersion":"EXPERIMENTAL_EXPANDED_TRAINING_V1","corpus":{"trainSha256":EXPECTED["train"],"validationSha256":EXPECTED["validation"],"trainRows":len(train),"validationRows":len(validation)},"model":{"repository":MODEL_ID,"revision":REVISION},"seed":SEED,"batchSize":BATCH,"epochs":EPOCHS,"maxLength":MAX_LENGTH,"learningRate":2e-5,"auxiliaryLossWeight":AUXILIARY_WEIGHT,"geometry":geometry,"sources":{"runner":sha(Path(__file__)),"customModel":sha(Path(__file__).with_name("mhs_v2_successor_model.py"))},"validationMetrics":metrics,"optimizerSteps":trainer.state.global_step};(OUTPUT/"run-manifest.json").write_text(canonical(manifest),encoding="utf8")
def main():
 p=argparse.ArgumentParser();p.add_argument("--preflight",action="store_true");p.add_argument("--execute-local-training",action="store_true");a=p.parse_args();train,validation,geometry=preflight();print(canonical({"status":"PREFLIGHT_PASSED","geometry":geometry,"modelLoads":0,"trainingRuns":0}));
 if a.execute_local_training: execute(train,validation,geometry)
if __name__=="__main__": main()
