import base64, hashlib, json, os, platform, sys, time
import numpy as np
import onnxruntime as ort
import timm, torch
from PIL import Image, __version__ as PILLOW_VERSION
from safetensors.torch import load_file

SOURCE, CONFIG, CONTROLS, ONNX, REPORT = sys.argv[1:6]
TOLERANCE = 0.0001
with open(CONFIG, encoding="utf-8") as handle: config = json.load(handle)
with open(CONTROLS, encoding="utf-8") as handle: controls = json.load(handle)
model = timm.create_model(config["architecture"], pretrained=False, num_classes=config["num_classes"])
model.load_state_dict(load_file(SOURCE), strict=True); model.pretrained_cfg = config["pretrained_cfg"]; model.eval()
data_config = timm.data.resolve_model_data_config(model)
transform = timm.data.create_transform(**data_config, is_training=False)
dummy = torch.zeros((1, 3, 384, 384), dtype=torch.float32)
os.makedirs(os.path.dirname(ONNX), exist_ok=True)
torch.onnx.export(model, dummy, ONNX, input_names=["input"], output_names=["logits"], dynamic_axes={"input": {0: "batch_size"}, "logits": {0: "batch_size"}}, opset_version=17, do_constant_folding=True)
session = ort.InferenceSession(ONNX, providers=["CPUExecutionProvider"])
rows = []
with torch.no_grad():
  for control in controls["controls"]:
    with Image.open(control["path"]) as image: tensor = transform(image.convert("RGB")).unsqueeze(0).numpy().astype(np.float32, copy=False)
    source_logits = model(torch.from_numpy(tensor)).cpu().numpy().astype(np.float32, copy=False).reshape(-1)
    onnx_logits = session.run(["logits"], {"input": tensor})[0].astype(np.float32, copy=False).reshape(-1)
    diff = np.abs(source_logits - onnx_logits)
    rows.append({"controlId": control["id"], "shape": list(tensor.shape), "dtype": str(tensor.dtype), "elementCount": int(tensor.size), "tensorBase64": base64.b64encode(tensor.tobytes()).decode("ascii"), "tensorDigest": hashlib.sha256(tensor.tobytes()).hexdigest(), "sourceLogits": source_logits.tolist(), "onnxLogits": onnx_logits.tolist(), "maxAbs": float(diff.max()), "meanAbs": float(diff.mean()), "sourceArgmax": int(source_logits.argmax()), "onnxArgmax": int(onnx_logits.argmax()), "agreement": bool(source_logits.argmax() == onnx_logits.argmax())})
report = {"tolerance": TOLERANCE, "reference": {"python": sys.version.split()[0], "torch": torch.__version__, "timm": timm.__version__, "onnxruntime": ort.__version__, "pillow": PILLOW_VERSION, "numpy": np.__version__, "platform": platform.platform()}, "input": {"name": session.get_inputs()[0].name, "type": session.get_inputs()[0].type, "shape": session.get_inputs()[0].shape}, "output": {"name": session.get_outputs()[0].name, "type": session.get_outputs()[0].type, "shape": session.get_outputs()[0].shape}, "rows": rows, "status": "PASS" if all(x["maxAbs"] <= TOLERANCE and x["agreement"] for x in rows) else "FAILED"}
with open(REPORT, "w", encoding="utf-8") as handle: json.dump(report, handle, indent=2); handle.write("\n")
if report["status"] != "PASS": raise SystemExit("source/ONNX parity failed")
