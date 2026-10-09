import json
import struct
import numpy as np
values = [0, 1, 2, 3, 10, 64, 127, 128, 200, 254, 255]
scale = np.float32(1 / 255)
rows = []
for value in values:
    result = np.float32(np.float32(value) * scale)
    rows.append({"input": value, "value": float(result), "bits": struct.pack("<f", result).hex()})
print(json.dumps({"scale": float(scale), "scaleBits": struct.pack("<f", scale).hex(), "rows": rows}))
