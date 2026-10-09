import argparse,hashlib,json,time
from pathlib import Path
import torch,timm
from PIL import Image
from timm.data import create_transform
from safetensors.torch import load_file
HEAD='df76eec9c0c53dcd265f62fbedb9fe107d3fb754ba4a09ed71fd34743400b33d';MODEL='44b92c6bf277e4a87617c8e5fb2c1bd04db34f83f601fc6b3c04571d48639b36'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
class Head(torch.nn.Module):
 def __init__(self):super().__init__();self.sthn_binary_head=torch.nn.Sequential(torch.nn.Linear(220,64),torch.nn.ReLU(),torch.nn.Dropout(.20),torch.nn.Linear(64,2))
 def forward(self,x):return self.sthn_binary_head(x)
def main():
 p=argparse.ArgumentParser();p.add_argument('--root',required=True);p.add_argument('--output',required=True);a=p.parse_args();root=Path(a.root);frozen=json.loads((root/'frozen-unseen-corpus.json').read_text());manifest=json.loads((root/'intake-manifest.json').read_text());base=root.parent/'owen-elliott-image-safety-classifier-xs';head=base/'e5o-nonlinear-head-seed-104729'/'best-head.safetensors';model=base/'e2o-model.safetensors'
 if sha(head)!=HEAD:raise RuntimeError('E5O BEST checkpoint SHA mismatch')
 if sha(model)!=MODEL:raise RuntimeError('Pinned Owen safetensors SHA mismatch')
 by={x['candidateId']:x for x in manifest['candidates']};t=create_transform(input_size=(3,224,224),interpolation='bicubic',crop_pct=.95,mean=(.485,.456,.406),std=(.229,.224,.225),is_training=False);back=timm.create_model('swiftformer_xs',pretrained=False,num_classes=3);back.load_state_dict(load_file(str(model)),strict=True);back.eval();h=Head();h.load_state_dict(load_file(str(head)),strict=True);h.eval();rows=[]
 with torch.no_grad():
  for r in frozen['candidates']:
   c=by[r['candidateId']];start=time.perf_counter();
   with Image.open(root/c['relativeAsset']) as im:x=t(im.convert('RGB')).unsqueeze(0)
   z=h(back.forward_head(back.forward_features(x),pre_logits=True));prob=torch.softmax(z,1)[0,1].item();rows.append({'candidateId':r['candidateId'],'decision':'BLOCK' if z.argmax(1).item() else 'PASS','blockProbability':prob,'rawBinaryOutput':[float(v) for v in z[0].tolist()],'latencyMs':(time.perf_counter()-start)*1000})
 Path(a.output).write_text(json.dumps({'bestHeadSha256':HEAD,'rows':rows},indent=2)+'\n')
if __name__=='__main__':main()
