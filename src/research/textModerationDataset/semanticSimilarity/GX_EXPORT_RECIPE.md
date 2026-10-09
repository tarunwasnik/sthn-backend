# GX pinned export recipe

Authority: `intfloat/multilingual-e5-small@053834db62d809d8f124a76b687fbd948e13ef3e`, MIT, semantic-similarity audit only.

The seven source files are acquired from `https://huggingface.co/intfloat/multilingual-e5-small/resolve/053834db62d809d8f124a76b687fbd948e13ef3e/<filename>`. The contract module freezes their SHA-256 values. The ignored artifact root is:

`evaluation-cache/text-moderation/semantic/intfloat-multilingual-e5-small/053834db62d809d8f124a76b687fbd948e13ef3e/`

The isolated environment uses uv-managed CPython 3.12.10 and direct pins `torch==2.3.1`, `transformers==4.42.4`, `safetensors==0.4.3`, `onnx==1.16.1`, `onnxruntime==1.18.1`, and `numpy==1.26.4`. It is not part of the backend dependency graph. Package resolution is bounded to packages published before 2024-07-31 and binary wheels only.

Run the export with the isolated interpreter:

`<artifact-root>/export-toolchain/.venv/Scripts/python.exe src/research/textModerationDataset/semanticSimilarity/export_e5_small_onnx.py <artifact-root>`

The script uses offline/local-only model loading and legacy `torch.onnx.export` with opset 17, constant folding, embedded parameters, dynamic batch/sequence axes, `input_ids` and `attention_mask` int64 inputs, and one `last_hidden_state` float32 output. It performs two clean exports and records both hashes, then checks the graph and executes the non-frozen PyTorch↔ONNX parity suite.

Complete runtime and manifest certification with:

- `npm run certify:text-moderation:e5-small-gx:node -- <artifact-root>`
- `npm run manifest:text-moderation:e5-small-gx:create -- <artifact-root>`

Every output is fail-closed and refuses overwrite. Delete/recreate the entire ignored artifact revision directory only as a deliberate clean-room recertification operation.
