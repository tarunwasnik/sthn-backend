import base64
import hashlib
import json
import sys

import cv2
import numpy as np


def digest(value):
    return hashlib.sha256(value.tobytes()).hexdigest()


def stage(array, channels):
    raw = array.tobytes()
    return {
        "width": int(array.shape[1]),
        "height": int(array.shape[0]),
        "channels": channels,
        "length": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "sample": list(raw[:24]),
        "base64": base64.b64encode(raw).decode("ascii"),
    }


source = np.fromfile(sys.argv[1], dtype=np.uint8)
decoded = cv2.imdecode(source, cv2.IMREAD_UNCHANGED)
if decoded is None:
    raise RuntimeError("OpenCV decode failed")
if decoded.ndim == 2:
    bgr = cv2.cvtColor(decoded, cv2.COLOR_GRAY2BGR)
elif decoded.shape[2] == 4:
    bgr = cv2.cvtColor(decoded, cv2.COLOR_BGRA2BGR)
elif decoded.shape[2] == 3:
    bgr = decoded
else:
    raise RuntimeError("Unsupported canonical OpenCV channel count")
rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
side = max(rgb.shape[0], rgb.shape[1])
square = np.zeros((side, side, 3), dtype=np.uint8)
square[: rgb.shape[0], : rgb.shape[1]] = rgb
resized = cv2.resize(square, (320, 320), interpolation=cv2.INTER_LINEAR)
blob = cv2.dnn.blobFromImage(cv2.cvtColor(square, cv2.COLOR_RGB2BGR), 1 / 255.0, (320, 320), (0, 0, 0), swapRB=True, crop=False)
manual_tensor = np.transpose(resized.astype(np.float32) / 255.0, (2, 0, 1))[np.newaxis, ...]
print(json.dumps({
    "native": stage(decoded, 1 if decoded.ndim == 2 else int(decoded.shape[2])),
    "rgb": stage(rgb, 3),
    "square": stage(square, 3),
    "resized": stage(resized, 3),
    "tensor": {"shape": list(blob.shape), "length": int(blob.size), "sha256": digest(blob), "sample": blob.reshape(-1)[:12].tolist(), "base64": base64.b64encode(blob.tobytes()).decode("ascii")},
    "manualTensor": {"shape": list(manual_tensor.shape), "length": int(manual_tensor.size), "sha256": digest(manual_tensor), "sample": manual_tensor.reshape(-1)[:12].tolist(), "base64": base64.b64encode(manual_tensor.tobytes()).decode("ascii")},
}))
