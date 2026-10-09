import base64
import hashlib
import json
import sys
import cv2
import numpy as np

def stage(array, channels, include_bytes=False):
    raw = array.tobytes()
    result = {"width": int(array.shape[1]), "height": int(array.shape[0]), "channels": channels, "length": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}
    if include_bytes: result["base64"] = base64.b64encode(raw).decode("ascii")
    return result

source = np.fromfile(sys.argv[1], dtype=np.uint8)
decoded = cv2.imdecode(source, cv2.IMREAD_UNCHANGED)
if decoded is None: raise RuntimeError("OpenCV decode failed")
native_channels = 1 if decoded.ndim == 2 else int(decoded.shape[2])
if decoded.ndim == 2: bgr = cv2.cvtColor(decoded, cv2.COLOR_GRAY2BGR)
elif decoded.shape[2] == 4: bgr = cv2.cvtColor(decoded, cv2.COLOR_BGRA2BGR)
elif decoded.shape[2] == 3: bgr = decoded
else: raise RuntimeError("Unsupported OpenCV channel count")
rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
side = max(rgb.shape[0], rgb.shape[1])
square = np.zeros((side, side, 3), dtype=np.uint8)
square[:rgb.shape[0], :rgb.shape[1]] = rgb
resized = cv2.resize(square, (320, 320), interpolation=cv2.INTER_LINEAR)
# This is the canonical NudeNet source operation; the other two tensors only diagnose float materialization.
blob = cv2.dnn.blobFromImage(cv2.cvtColor(square, cv2.COLOR_RGB2BGR), 1 / 255.0, (320, 320), (0, 0, 0), swapRB=True, crop=False)
manual_division = np.transpose(resized.astype(np.float32) / 255.0, (2, 0, 1))[np.newaxis, ...]
manual_float32_scale = np.transpose(resized.astype(np.float32) * np.float32(1 / 255.0), (2, 0, 1))[np.newaxis, ...]
def tensor(value):
    raw = value.tobytes()
    return {"shape": list(value.shape), "length": int(value.size), "finite": int(np.isfinite(value).sum()), "sha256": hashlib.sha256(raw).hexdigest(), "min": float(value.min()), "max": float(value.max()), "mean": float(value.mean()), "sample": value.reshape(-1)[:12].tolist(), "base64": base64.b64encode(raw).decode("ascii")}
print(json.dumps({"native": {"width": int(decoded.shape[1]), "height": int(decoded.shape[0]), "channels": native_channels}, "rgb": stage(rgb, 3), "square": stage(square, 3), "resized": stage(resized, 3, True), "canonicalBlob": tensor(blob), "manualDivision": tensor(manual_division), "manualFloat32Scale": tensor(manual_float32_scale)}))
