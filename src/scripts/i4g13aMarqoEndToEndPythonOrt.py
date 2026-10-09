import hashlib, json, sys
import numpy as np
import onnxruntime as ort
import timm
from PIL import Image

manifest_path, config_path, model_path, output_path = sys.argv[1:5]
expected = {"landscape-gradient":"9aaa9b47c9aced1a87ac031506ca6bd23a501cd3f47489f656d6b84ccbf0c22e","portrait-gradient":"70320ed3bde3331c4848ac145a8a91113f6ee1fccb90c4641bf84ee6a8129060","square-high-frequency":"f83646eaab7736d0f23f79a4215472f124d42443b816723315772139571d7063","wide-asymmetric":"7f0cd47e385d3e5a64460988a18838b81e5edfc0962889945274613203dd22df","tall-asymmetric":"3b7c70197444ec3a3180bd9c9f69938ba9df674ae395cd2e01fcb4a1803c69b0","mixed-nondivisible":"c95afb40dfb51273541f3801955f973dfd86e1ba9078ff696cb0ad28f537929b"}
manifest=json.load(open(manifest_path,encoding="utf-8")); config=json.load(open(config_path,encoding="utf-8"))
model=timm.create_model(config["architecture"],pretrained=False,num_classes=config["num_classes"]); model.pretrained_cfg=config["pretrained_cfg"]
transform=timm.data.create_transform(**timm.data.resolve_model_data_config(model),is_training=False)
with open(model_path,"rb") as handle: onnx_sha=hashlib.sha256(handle.read()).hexdigest()
session=ort.InferenceSession(model_path,providers=["CPUExecutionProvider"]); rows=[]
for control in manifest["controls"]:
  source=open(control["path"],"rb").read(); source_sha=hashlib.sha256(source).hexdigest()
  if source_sha != control["sha256"]: raise RuntimeError("source identity mismatch: "+control["id"])
  with Image.open(control["path"]) as image:
    dimensions=list(image.size); tensor=transform(image.convert("RGB")).unsqueeze(0).numpy().astype(np.float32,copy=False)
  raw=tensor.tobytes(); tensor_sha=hashlib.sha256(raw).hexdigest()
  if dimensions != [control["width"],control["height"]] or tensor.shape != (1,3,384,384) or tensor_sha != expected[control["id"]] or not np.isfinite(tensor).all(): raise RuntimeError("tensor authority mismatch: "+control["id"])
  output=session.run(["logits"],{"input":tensor})[0].astype(np.float32,copy=False)
  if output.shape != (1,2) or output.dtype != np.float32: raise RuntimeError("output contract mismatch: "+control["id"])
  outraw=output.tobytes(); logits=output.reshape(-1)
  rows.append({"controlId":control["id"],"sourceSha256":source_sha,"sourceDimensions":dimensions,"tensorSha256":tensor_sha,"tensorShape":[1,3,384,384],"tensorDtype":"float32","onnxSha256":onnx_sha,"outputShape":[1,2],"outputDtype":"float32","logits":[float(x) for x in logits],"outputSha256":hashlib.sha256(outraw).hexdigest(),"argmax":int(np.argmax(logits))})
result={"runtime":{"python":sys.version.split()[0],"onnxruntime":ort.__version__,"provider":"CPUExecutionProvider"},"nativeClassOrder":["NSFW","SFW"],"postprocessing":"none","rows":rows}
result["semanticFingerprint"]=hashlib.sha256(json.dumps(result,sort_keys=True,separators=(",",":")).encode()).hexdigest()
with open(output_path,"w",encoding="utf-8") as handle: json.dump(result,handle,indent=2);handle.write("\n")
