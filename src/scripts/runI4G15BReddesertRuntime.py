import hashlib,json,os,sys,time
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
import torch,torchvision,onnx,onnxruntime,safetensors,PIL

ROOT=Path(r"D:\StHn\backend")
REV="2dd893c362e61d396432e451dabdfac4067f6ba2"
SRC=ROOT/"evaluation-cache/image-moderation/reddesert-nsfw-detection"/REV/"source"
OUT=ROOT/"evaluation-output/image-moderation/i4-g15b-reddesert-runtime-authority"
CTRL=OUT/"synthetic-controls"
sys.path.insert(0,str(SRC)); from model_architecture import load_bundle_model
sha=lambda b:hashlib.sha256(b).hexdigest()
def dump(name,x): (OUT/name).write_text(json.dumps(x,indent=2)+"\n",encoding="utf8")
def file(x): return {"path":str(x),"bytes":x.stat().st_size,"sha256":sha(x.read_bytes())}
def pattern(name,w,h):
  y,x=np.mgrid[0:h,0:w]; a=np.zeros((h,w,3),dtype=np.uint8)
  a[:,:,0]=(x*17+y*3)%256;a[:,:,1]=(x*5+y*19)%256;a[:,:,2]=((x//7+y//11)*53)%256
  a[::13,:,:]=255;a[:,::17,:]=0
  p=CTRL/(name+".png");Image.fromarray(a,"RGB").save(p,compress_level=9);return p
OUT.mkdir(parents=True,exist_ok=True);CTRL.mkdir(exist_ok=True)
spec=[("landscape",640,360),("portrait",360,640),("square",511,511),("wide",1024,257),("tall",257,1024),("high_frequency_spatial",777,333)]
paths=[pattern(*x) for x in spec]
controls=[]
transform=torchvision.transforms.Compose([torchvision.transforms.Resize((320,320)),torchvision.transforms.ToTensor(),torchvision.transforms.Normalize(mean=[.485,.456,.406],std=[.229,.224,.225])])
for p in paths:
 t=transform(Image.open(p).convert("RGB")).unsqueeze(0); np.save(CTRL/(p.stem+".npy"),t.numpy());controls.append({"id":p.stem,**file(p),"tensorSha256":sha(t.numpy().tobytes()),"shape":list(t.shape)})
dump("synthetic-control-manifest.json",{"generator":"deterministic local NumPy/Pillow spatial patterns","controls":controls})
model,missing,unexpected=load_bundle_model(str(SRC/"nsfw_model.safetensors"),architecture="resnet34",num_classes=11,device="cpu",strict=False,layout="auto")
if missing or unexpected: raise RuntimeError(f"nonexact state dict {missing} {unexpected}")
model.eval(); logs=[]
for c in controls:
 t=torch.from_numpy(np.load(CTRL/(c["id"]+".npy"))); runs=[]
 for _ in range(3):
  with torch.no_grad(): runs.append(model(t).numpy())
 if any(not np.array_equal(runs[0],x) for x in runs[1:]): raise RuntimeError("source nondeterminism")
 logs.append({"controlId":c["id"],"tensorSha256":c["tensorSha256"],"logits":runs[0].reshape(-1).tolist(),"logitsSha256":sha(runs[0].tobytes()),"argmax":int(runs[0].argmax()),"shape":list(runs[0].shape),"dtype":str(runs[0].dtype)})
dump("source-runtime-evidence.json",{"environment":{"python":sys.version,"torch":torch.__version__,"torchvision":torchvision.__version__,"safetensors":safetensors.__version__,"onnx":onnx.__version__,"onnxruntime":onnxruntime.__version__,"pillow":PIL.__version__,"device":"cpu"},"determinism":"EXACT_3_REPEATS","rows":logs})
derived=OUT/"reddesert-derived-opset17.onnx"; example=torch.from_numpy(np.load(CTRL/"square.npy"));torch.onnx.export(model,example,str(derived),input_names=["input"],output_names=["logits"],opset_version=17,dynamo=False)
sess=onnxruntime.InferenceSession(str(derived),providers=["CPUExecutionProvider"]); rows=[]
for r in logs:
 t=np.load(CTRL/(r["controlId"]+".npy"));a=np.array(r["logits"],np.float32).reshape(1,-1);b=sess.run(None,{"input":t})[0];d=np.abs(a-b);rows.append({"controlId":r["controlId"],"maxAbs":float(d.max()),"meanAbs":float(d.mean()),"argmaxAgreement":int(a.argmax())==int(b.argmax()),"onnxLogits":b.reshape(-1).tolist(),"onnxLogitsSha256":sha(b.tobytes())})
worst=max(x["maxAbs"] for x in rows);mean=max(x["meanAbs"] for x in rows);passed=worst<=1e-5 and mean<=1e-6 and all(x["argmaxAgreement"] for x in rows)
dump("onnx-conversion-evidence.json",{"classification":"STHN_EVALUATION_DERIVED","opset":17,"artifact":file(derived),"input":{"name":"input","shape":[1,3,320,320]},"output":{"name":"logits","shape":[1,11]}})
dump("source-onnx-parity.json",{"status":"PASS" if passed else "FAIL","tolerance":{"maxAbs":1e-5,"meanAbs":1e-6},"aggregateWorstMaxAbs":worst,"aggregateWorstMeanAbs":mean,"rows":rows})
if not passed: raise RuntimeError("source ONNX parity gate failed")
