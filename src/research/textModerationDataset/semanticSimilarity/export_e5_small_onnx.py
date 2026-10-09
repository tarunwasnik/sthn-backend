from __future__ import annotations

import hashlib
import importlib.metadata
import json
import os
import platform
import sys
from pathlib import Path

if len(sys.argv) != 2:
    raise SystemExit("usage: export_e5_small_onnx.py <artifact-root>")
ARTIFACT_ROOT = Path(sys.argv[1]).resolve()
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
os.environ["TOKENIZERS_PARALLELISM"] = "false"
os.environ["HF_HOME"] = str(ARTIFACT_ROOT / "export-toolchain" / "huggingface-cache")

import numpy as np
import onnx
import onnxruntime as ort
import torch
from transformers import AutoModel, AutoTokenizer

REVISION = "053834db62d809d8f124a76b687fbd948e13ef3e"
OPSET = 17
MAX_ABSOLUTE_TOLERANCE = 1e-4
MEAN_ABSOLUTE_TOLERANCE = 1e-5
MINIMUM_POOLED_COSINE = 0.999999
PARITY_SUITE_VERSION = "STHN_E5_SMALL_NON_FROZEN_PARITY_V1"
PROBES = [
    ("EN_SHORT", "A quiet library opens early."),
    ("EN_LONG", "A community workshop offers practical lessons about repairing bicycles and sharing tools responsibly."),
    ("HI", "आज मौसम सुहावना है और बच्चे बगीचे में खेल रहे हैं।"),
    ("TH", "วันนี้อากาศดีและผู้คนกำลังเดินเล่นในสวน"),
    ("MIXED", "Project नमस्ते รุ่น 2 — ready at 09:30!"),
    ("PUNCTUATION", "Wait... really?! (Yes.) #update"),
    ("EMPTY", ""),
    ("NEAR_EMPTY", "   .   "),
    ("BATCH_A", "The blue notebook is on the desk."),
    ("BATCH_B", "एक छोटी किताब मेज़ पर रखी है।"),
]

class LastHiddenState(torch.nn.Module):
    def __init__(self, model: torch.nn.Module) -> None:
        super().__init__()
        self.model = model

    def forward(self, input_ids: torch.Tensor, attention_mask: torch.Tensor) -> torch.Tensor:
        return self.model(input_ids=input_ids, attention_mask=attention_mask, return_dict=False)[0]

def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

def pooled(values: np.ndarray, mask: np.ndarray) -> np.ndarray:
    expanded = mask[..., None].astype(np.float64)
    result = (values.astype(np.float64) * expanded).sum(axis=1) / np.clip(expanded.sum(axis=1), 1e-12, None)
    return result / np.clip(np.linalg.norm(result, axis=1, keepdims=True), 1e-12, None)

def export(wrapper: torch.nn.Module, example: dict[str, torch.Tensor], target: Path) -> None:
    torch.onnx.export(
        wrapper,
        (example["input_ids"], example["attention_mask"]),
        str(target),
        input_names=["input_ids", "attention_mask"],
        output_names=["last_hidden_state"],
        dynamic_axes={
            "input_ids": {0: "batch_size", 1: "sequence_length"},
            "attention_mask": {0: "batch_size", 1: "sequence_length"},
            "last_hidden_state": {0: "batch_size", 1: "sequence_length"},
        },
        opset_version=OPSET,
        do_constant_folding=True,
        export_params=True,
    )

def main() -> None:
    root = ARTIFACT_ROOT
    source, output, certification = root / "source", root / "export", root / "certification"
    first, second = output / "model.onnx", output / "model.reexport.onnx"
    certification_target = certification / "python-export-certification.json"
    if first.exists() or second.exists() or certification_target.exists():
        raise RuntimeError("GX export/certification is immutable and already exists")
    output.mkdir(parents=True, exist_ok=True)
    certification.mkdir(parents=True, exist_ok=True)

    torch.manual_seed(20260911)
    torch.set_num_threads(1)
    torch.use_deterministic_algorithms(True)
    tokenizer = AutoTokenizer.from_pretrained(source, local_files_only=True, use_fast=True)
    model = AutoModel.from_pretrained(source, local_files_only=True, use_safetensors=True).eval()
    if model.config.hidden_size != 384 or tokenizer.model_max_length != 512:
        raise RuntimeError("Pinned model hidden size or tokenizer maximum changed")
    wrapper = LastHiddenState(model).eval()
    example = tokenizer([PROBES[0][1], PROBES[1][1]], padding=True, truncation=True, max_length=512, return_tensors="pt")
    inputs = {name: example[name] for name in ("input_ids", "attention_mask")}
    export(wrapper, inputs, first)
    export(wrapper, inputs, second)
    onnx.checker.check_model(str(first), full_check=True)

    session = ort.InferenceSession(str(first), providers=["CPUExecutionProvider"])
    if [item.name for item in session.get_inputs()] != ["input_ids", "attention_mask"] or [item.name for item in session.get_outputs()] != ["last_hidden_state"]:
        raise RuntimeError("Exported ONNX names violate the GX contract")

    maximum_errors: list[float] = []
    mean_errors: list[float] = []
    pooled_cosines: list[float] = []
    probe_results: list[dict[str, object]] = []
    groups = [[probe] for probe in PROBES[:8]] + [PROBES[8:]]
    with torch.inference_mode():
        for group in groups:
            encoded = tokenizer([text for _, text in group], padding=True, truncation=True, max_length=512, return_tensors="pt")
            model_inputs = {name: encoded[name] for name in ("input_ids", "attention_mask")}
            expected = wrapper(**model_inputs).cpu().numpy()
            actual = session.run(["last_hidden_state"], {name: value.cpu().numpy().astype(np.int64) for name, value in model_inputs.items()})[0]
            difference = np.abs(expected.astype(np.float64) - actual.astype(np.float64))
            max_error, mean_error = float(difference.max()), float(difference.mean())
            expected_pool, actual_pool = pooled(expected, model_inputs["attention_mask"].cpu().numpy()), pooled(actual, model_inputs["attention_mask"].cpu().numpy())
            cosines = np.sum(expected_pool * actual_pool, axis=1)
            maximum_errors.append(max_error); mean_errors.append(mean_error); pooled_cosines.extend(float(item) for item in cosines)
            for index, (probe_id, _) in enumerate(group):
                probe_results.append({"probeId": probe_id, "sequenceLength": int(model_inputs["attention_mask"][index].sum()),
                    "paddedSequenceLength": int(model_inputs["attention_mask"].shape[1]), "maxAbsoluteError": max_error,
                    "meanAbsoluteError": mean_error, "pooledCosine": float(cosines[index])})

    max_absolute_error = max(maximum_errors)
    mean_absolute_error = float(np.mean(mean_errors))
    minimum_pooled_cosine = min(pooled_cosines)
    if max_absolute_error > MAX_ABSOLUTE_TOLERANCE or mean_absolute_error > MEAN_ABSOLUTE_TOLERANCE or minimum_pooled_cosine < MINIMUM_POOLED_COSINE:
        raise RuntimeError("PyTorch to ONNX numerical parity exceeds GX tolerances")

    deterministic_encodings = []
    for probe_id, text in PROBES:
        first_encoding = tokenizer(text, truncation=True, max_length=512)
        second_encoding = tokenizer(text, truncation=True, max_length=512)
        if first_encoding != second_encoding or len(first_encoding["input_ids"]) > 512 or len(first_encoding["input_ids"]) != len(first_encoding["attention_mask"]):
            raise RuntimeError(f"Tokenizer certification failed: {probe_id}")
        deterministic_encodings.append({"probeId": probe_id, "tokenCount": len(first_encoding["input_ids"])})
    maximum_probe = tokenizer("token " * 700, truncation=True, max_length=512)
    if len(maximum_probe["input_ids"]) != 512:
        raise RuntimeError("Tokenizer maximum sequence certification failed")

    packages = {name: importlib.metadata.version(name) for name in ["torch", "transformers", "safetensors", "onnx", "onnxruntime", "numpy", "tokenizers"]}
    report = {
        "schemaVersion": "STHN_E5_SMALL_PYTHON_EXPORT_CERTIFICATION_V1", "revision": REVISION,
        "pythonVersion": platform.python_version(), "packages": packages, "opset": OPSET,
        "exportRecipe": "torch.onnx.export legacy tracer; export_params=true; do_constant_folding=true; dynamic batch and sequence; token hidden state only",
        "onnx": {"path": "export/model.onnx", "byteSize": first.stat().st_size, "sha256": sha256(first),
            "secondExportSha256": sha256(second), "byteDeterministic": sha256(first) == sha256(second),
            "inputNames": [item.name for item in session.get_inputs()], "inputTypes": [item.type for item in session.get_inputs()],
            "inputShapes": [item.shape for item in session.get_inputs()], "outputName": session.get_outputs()[0].name,
            "outputType": session.get_outputs()[0].type, "outputShape": session.get_outputs()[0].shape,
            "hiddenDimension": model.config.hidden_size},
        "tokenizer": {"class": tokenizer.__class__.__name__, "modelMaxLength": tokenizer.model_max_length,
            "paddingSide": tokenizer.padding_side, "truncationSide": tokenizer.truncation_side,
            "padTokenId": tokenizer.pad_token_id, "deterministic": True, "maximumSequenceLength": len(maximum_probe["input_ids"]),
            "probes": deterministic_encodings},
        "parity": {"suiteVersion": PARITY_SUITE_VERSION, "probeCount": len(PROBES), "maxAbsoluteError": max_absolute_error,
            "meanAbsoluteError": mean_absolute_error, "minimumPooledCosine": minimum_pooled_cosine,
            "maxAbsoluteTolerance": MAX_ABSOLUTE_TOLERANCE, "meanAbsoluteTolerance": MEAN_ABSOLUTE_TOLERANCE,
            "minimumPooledCosineTolerance": MINIMUM_POOLED_COSINE, "status": "PASSED", "probes": probe_results},
        "frozenBenchmarkAccessed": False,
    }
    certification_target.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"onnxSha256": report["onnx"]["sha256"], "byteDeterministic": report["onnx"]["byteDeterministic"], "parity": report["parity"]}, ensure_ascii=True))

if __name__ == "__main__":
    main()
