import base64, hashlib, json, os, sys, time
import numpy as np
import onnxruntime as ort
import torch
from PIL import Image
from transformers import AutoImageProcessor, AutoModelForImageClassification

base = sys.argv[1]
source = os.path.join(base, "source")
derived = os.path.join(base, "derived")
controls = os.path.join(base, "controls")
os.makedirs(derived, exist_ok=True); os.makedirs(controls, exist_ok=True)
def save(name, image):
    path=os.path.join(controls,name+".png"); image.save(path); return path
x=np.linspace(0,255,401,dtype=np.uint8); y=np.linspace(0,255,173,dtype=np.uint8)[:,None]
fixtures=[("solid-rgb",Image.new("RGB",(64,39),(29,131,211))), ("gradient",Image.fromarray(np.dstack([np.tile(x,(173,1)),np.tile(y,(1,401)),np.full((173,401),97,dtype=np.uint8)]),"RGB")), ("checkerboard",Image.fromarray(np.kron(np.indices((19,31)).sum(0)%2,np.ones((13,11))).astype(np.uint8)*255,"L").convert("RGB")), ("portrait",Image.new("RGB",(97,301),(174,62,141))), ("landscape",Image.new("RGB",(511,83),(53,183,93))), ("rgba",Image.new("RGBA",(111,73),(201,42,81,99)))]
model=AutoModelForImageClassification.from_pretrained(source).eval(); processor=AutoImageProcessor.from_pretrained(source)
dummy=torch.zeros((1,3,224,224),dtype=torch.float32); onnx_path=os.path.join(derived,"lukejacob-fiveclass-evaluation-derived.onnx")
torch.onnx.export(model,(dummy,),onnx_path,input_names=["pixel_values"],output_names=["logits"],opset_version=17,dynamic_axes={"pixel_values":{0:"batch_size"},"logits":{0:"batch_size"}})
session=ort.InferenceSession(onnx_path,providers=["CPUExecutionProvider"]); rows=[]
for name,image in fixtures:
    path=save(name,image); tensor=processor(images=image.convert("RGB"),return_tensors="pt")["pixel_values"].to(torch.float32)
    with torch.no_grad(): source_logits=model(pixel_values=tensor).logits.detach().cpu().numpy().astype(np.float32)
    onnx_logits=session.run(["logits"],{"pixel_values":tensor.numpy()})[0].astype(np.float32)
    rows.append({"id":name,"path":path,"sourceTensorBase64":base64.b64encode(tensor.numpy().tobytes()).decode(),"tensorDigest":hashlib.sha256(tensor.numpy().tobytes()).hexdigest(),"shape":list(tensor.shape),"min":float(tensor.min()),"max":float(tensor.max()),"mean":float(tensor.mean()),"sourceLogits":source_logits.reshape(-1).tolist(),"onnxLogits":onnx_logits.reshape(-1).tolist(),"maxAbsSourceOnnx":float(np.abs(source_logits-onnx_logits).max())})
print(json.dumps({"reference":{"python":sys.version.split()[0],"torch":torch.__version__,"transformers":"4.36.2","Pillow":Image.__version__,"numpy":np.__version__,"onnxruntime":ort.__version__,"opset":17},"rows":rows},separators=(",",":")))
