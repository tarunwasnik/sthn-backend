import base64
import hashlib
import json
import sys

import numpy as np
import onnxruntime as ort


reference_path, model_path, output_path = sys.argv[1:4]
expected_inputs = {
    "landscape-gradient": "9aaa9b47c9aced1a87ac031506ca6bd23a501cd3f47489f656d6b84ccbf0c22e",
    "portrait-gradient": "70320ed3bde3331c4848ac145a8a91113f6ee1fccb90c4641bf84ee6a8129060",
    "square-high-frequency": "f83646eaab7736d0f23f79a4215472f124d42443b816723315772139571d7063",
    "wide-asymmetric": "7f0cd47e385d3e5a64460988a18838b81e5edfc0962889945274613203dd22df",
    "tall-asymmetric": "3b7c70197444ec3a3180bd9c9f69938ba9df674ae395cd2e01fcb4a1803c69b0",
    "mixed-nondivisible": "c95afb40dfb51273541f3801955f973dfd86e1ba9078ff696cb0ad28f537929b",
}
with open(reference_path, encoding="utf-8") as handle:
    reference = json.load(handle)

session = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
with open(model_path, "rb") as handle:
    model_sha256 = hashlib.sha256(handle.read()).hexdigest()
rows = []
for row in reference["rows"]:
    raw = base64.b64decode(row["tensorBase64"])
    tensor = np.frombuffer(raw, dtype=np.float32).reshape((1, 3, 384, 384))
    input_sha256 = hashlib.sha256(raw).hexdigest()
    if row["digest"] != input_sha256 or expected_inputs[row["controlId"]] != input_sha256 or tensor.dtype != np.float32 or tensor.shape != (1, 3, 384, 384):
        raise RuntimeError(f"canonical tensor mismatch: {row['controlId']}")
    output = session.run(["logits"], {"input": tensor})[0].astype(np.float32, copy=False)
    if output.dtype != np.float32 or output.shape != (1, 2):
        raise RuntimeError(f"unexpected output contract: {row['controlId']}")
    output_raw = output.tobytes()
    logits = output.reshape(-1)
    rows.append({
        "controlId": row["controlId"],
        "inputSha256": input_sha256,
        "onnxSha256": model_sha256,
        "inputShape": list(tensor.shape),
        "inputDtype": str(tensor.dtype),
        "outputShape": list(output.shape),
        "outputDtype": str(output.dtype),
        "outputSha256": hashlib.sha256(output_raw).hexdigest(),
        "logits": [float(value) for value in logits],
        "argmax": int(np.argmax(logits)),
    })

result = {
    "runtime": {"python": sys.version.split()[0], "onnxruntime": ort.__version__, "provider": "CPUExecutionProvider"},
    "modelSha256": model_sha256,
    "inputContract": {"name": "input", "shape": [1, 3, 384, 384], "dtype": "float32"},
    "outputContract": {"name": "logits", "shape": [1, 2], "dtype": "float32", "nativeClassOrder": ["NSFW", "SFW"], "postprocessing": "none"},
    "rows": rows,
}
result["semanticFingerprint"] = hashlib.sha256(json.dumps(result, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
with open(output_path, "w", encoding="utf-8") as handle:
    json.dump(result, handle, indent=2)
    handle.write("\n")
