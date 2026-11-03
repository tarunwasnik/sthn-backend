# AdamCodd V2 sole-runtime artifact packaging

Package the separately verified frozen runtime artifact at
`models/adamcodd-v2/model_int8.onnx` and set:

```text
STHN_IMAGE_AI_ADAM_V2_MODEL_PATH=models/adamcodd-v2/model_int8.onnx
```

The deployed artifact must be exactly 89,972,519 bytes with SHA-256
`ce69ce3cfbcb62655c386fc3223fe7e38c23bdf1f58eb356767566a72d275da0`.
The runtime must reject artifact paths inside `evaluation-cache` and
`evaluation-output`; it never downloads a model.

`STHN_IMAGE_AI_ADAM_PIPELINE` and `STHN_IMAGE_AI_ADAM_MODEL_PATH` are retired.
Any non-empty value for either is a configuration error; the runtime never
falls back to V1. The artifact must be exactly 89,972,519 bytes with SHA-256
`ce69ce3cfbcb62655c386fc3223fe7e38c23bdf1f58eb356767566a72d275da0`.
