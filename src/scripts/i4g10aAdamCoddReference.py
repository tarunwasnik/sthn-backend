import base64, hashlib, json, sys
import numpy as np
import onnxruntime as ort
from PIL import Image
from transformers import ViTFeatureExtractor

controls_path, processor_path, model_path = sys.argv[1:4]
with open(controls_path, "r", encoding="utf-8") as handle:
    controls = json.load(handle)
with open(processor_path, "r", encoding="utf-8") as handle:
    processor = ViTFeatureExtractor(**json.load(handle))
session = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
rows = []
for control in controls["controls"]:
    # Deliberately no ImageOps.exif_transpose. Explicit RGB conversion is the
    # canonical input-mode boundary for this control verifier.
    with Image.open(control["path"]) as image:
        tensor = processor(images=image.convert("RGB"), return_tensors="np")["pixel_values"].astype(np.float32, copy=False)
    logits = session.run(["logits"], {"pixel_values": tensor})[0].astype(np.float32, copy=False).reshape(-1)
    rows.append({
        "fixtureId": control["id"],
        "shape": list(tensor.shape),
        "dtype": str(tensor.dtype),
        "elementCount": int(tensor.size),
        "digest": hashlib.sha256(tensor.tobytes()).hexdigest(),
        "tensorBase64": base64.b64encode(tensor.tobytes()).decode("ascii"),
        "min": float(tensor.min()), "max": float(tensor.max()), "mean": float(tensor.mean(dtype=np.float64)),
        "samples": [float(tensor.reshape(-1)[index]) for index in [0, 1, 2, 147456, tensor.size - 1]],
        "logits": [float(value) for value in logits],
        "outputDigest": hashlib.sha256(logits.tobytes()).hexdigest(),
    })
print(json.dumps({"reference":{"python":sys.version.split()[0],"transformers":"4.36.2","Pillow":"10.2.0","numpy":np.__version__,"onnxruntime":ort.__version__},"rows":rows}, separators=(",", ":")))
