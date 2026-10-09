# AdamCodd V1 production artifact packaging

The runtime only loads `STHN_IMAGE_AI_ADAM_MODEL_PATH`; it has no fallback to `evaluation-cache` and never downloads a model.

For Render, package one copy of the pinned ONNX file in the deployed backend artifact, preferably at `models/adamcodd/model_int8.onnx`, and set `STHN_IMAGE_AI_ADAM_MODEL_PATH=models/adamcodd/model_int8.onnx`. Release verification must compare the packaged file to SHA-256 `d25aa73fe1eec78459e35ff911e2af98f652ee919b48d9c54316c86d5ff435fa` before traffic is enabled.

The repository currently has the verified model only under ignored `evaluation-cache`; packaging the immutable production copy is a deployment follow-up and is intentionally not performed by I2.
