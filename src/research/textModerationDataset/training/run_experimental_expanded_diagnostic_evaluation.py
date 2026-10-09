"""Local-only diagnostic evaluator for the completed expanded-data XLM-R experiment.

This runner deliberately has no threshold search, training path, or protected-data path.
It evaluates the exported binary head by argmax against the development validation corpus
and the three downloaded diagnostic archives.
"""
import argparse
import csv
import hashlib
import io
import json
import os
import shutil
import sys
import zipfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

os.environ["CUDA_VISIBLE_DEVICES"] = ""
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
os.environ["TOKENIZERS_PARALLELISM"] = "false"

from mhs_v2_successor_model import CATEGORY_TO_ID, build_successor_model_class

ROOT = Path(__file__).resolve().parents[4]
CORPUS = ROOT / "dataset-research/text-moderation/experimental-expanded-training-v1"
VALIDATION = CORPUS / "validation.jsonl"
MODEL = ROOT / "evaluation-cache/text-moderation/classifier-training/experimental-expanded-training-v1/final"
OUTPUT = ROOT / "evaluation-cache/text-moderation/classifier-evaluation/experimental-expanded-training-v1-diagnostic-evaluation"
EXTERNAL = ROOT / "dataset-research/text-moderation/external-datasets"
EXPECTED_MODEL_SHA = "b526781ad69abeacfce8ee19c0795a09c9b0d166e345b84a1a212f240162172f"
EXPECTED_VALIDATION_SHA = "329d96fa300c9b0baf13bf378874001d5a13c76b0a3d1e717b9d0410b3430a7e"
EXPECTED_VALIDATION_ROWS = 1433
BATCH_SIZE = 8
MAX_LENGTH = 160
LABELS = {"hateful": 1, "non-hateful": 0, "hate": 1, "nothate": 0}
BLOCK_CATEGORIES = (*CATEGORY_TO_ID.keys(), "BINARY_ONLY_BLOCK")


def canonical(value):
    return json.dumps(value, sort_keys=True, indent=2, ensure_ascii=False, allow_nan=False) + "\n"


def sha_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        while block := handle.read(8 * 1024 * 1024):
            digest.update(block)
    return digest.hexdigest()


def now():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def metric_values(labels, predictions):
    if not labels or len(labels) != len(predictions):
        raise ValueError("metrics require equally sized non-empty binary sequences")
    matrix = [[0, 0], [0, 0]]
    for actual, predicted in zip(labels, predictions):
        if actual not in (0, 1) or predicted not in (0, 1):
            raise ValueError("metrics require binary labels")
        matrix[actual][predicted] += 1

    per_class = {}
    for index, name in enumerate(("ALLOW", "BLOCK")):
        true_positive = matrix[index][index]
        false_positive = matrix[1 - index][index]
        false_negative = matrix[index][1 - index]
        precision = true_positive / (true_positive + false_positive) if true_positive + false_positive else 0.0
        recall = true_positive / (true_positive + false_negative) if true_positive + false_negative else 0.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        per_class[name] = {"precision": precision, "recall": recall, "f1": f1, "support": sum(matrix[index])}

    return {
        "confusionMatrix": matrix,
        "accuracy": (matrix[0][0] + matrix[1][1]) / len(labels),
        "macroF1": (per_class["ALLOW"]["f1"] + per_class["BLOCK"]["f1"]) / 2,
        "balancedAccuracy": (per_class["ALLOW"]["recall"] + per_class["BLOCK"]["recall"]) / 2,
        "allow": per_class["ALLOW"],
        "block": per_class["BLOCK"],
        "falsePositives": matrix[0][1],
        "falseNegatives": matrix[1][0],
        "predictedCounts": {"ALLOW": matrix[0][0] + matrix[1][0], "BLOCK": matrix[0][1] + matrix[1][1]},
    }


def archive_path(source):
    archives = sorted((EXTERNAL / source / "raw").glob("*.zip"))
    if len(archives) != 1:
        raise RuntimeError(f"SOURCE_PREFLIGHT_FAILURE: expected exactly one {source} archive")
    return archives[0]


def csv_rows(archive, member):
    with zipfile.ZipFile(archive) as bundle:
        if member not in bundle.namelist():
            raise RuntimeError(f"SOURCE_PREFLIGHT_FAILURE: missing archive member {member}")
        with bundle.open(member) as binary:
            yield from csv.DictReader(io.TextIOWrapper(binary, encoding="utf-8-sig", newline=""))


def external_rows(source, member, text_field, label_field, language=None):
    archive = archive_path(source)
    rows, excluded = [], Counter()
    physical = 0
    for row in csv_rows(archive, member):
        physical += 1
        text = row.get(text_field)
        label = LABELS.get((row.get(label_field) or "").strip().lower())
        if not isinstance(text, str) or not text.strip():
            excluded["missingOrEmptyText"] += 1
        elif label is None:
            excluded["unmappedLabel"] += 1
        else:
            rows.append({"text": text, "target": label, "language": language, "functionality": row.get("functionality") or None})
    return rows, {"archive": archive, "member": member, "physicalRows": physical, "excluded": dict(sorted(excluded.items()))}


def load_dynahate():
    member = "Dynamically-Generated-Hate-Speech-Dataset-36f9dc849626bc2f6d2e1c2861db556294a2a947/Dynamically Generated Hate Dataset v0.2.3.csv"
    return external_rows("DYNAHATE", member, "text", "label")


def load_hatecheck():
    member = "hatecheck-data-3490854f969111a32c55c05f0d9788b471337fa9/all_cases.csv"
    return external_rows("HATECHECK", member, "test_case", "label_gold", language="English")


def load_multilingual_hatecheck():
    archive = archive_path("MULTILINGUAL_HATECHECK")
    prefix = "multilingual-hatecheck-a03f2caf2023a402d85064bda243e46d280408f0/MHC Final Cases/hatecheck_cases_final_"
    with zipfile.ZipFile(archive) as bundle:
        members = sorted(name for name in bundle.namelist() if name.startswith(prefix) and name.endswith(".csv"))
    if len(members) != 10:
        raise RuntimeError("SOURCE_PREFLIGHT_FAILURE: expected ten Multilingual HateCheck final-case CSV members")
    rows, excluded, physical = [], Counter(), 0
    for member in members:
        language = Path(member).stem.removeprefix("hatecheck_cases_final_")
        member_rows, metadata = external_rows("MULTILINGUAL_HATECHECK", member, "test_case", "label_gold", language=language)
        rows.extend(member_rows)
        physical += metadata["physicalRows"]
        excluded.update(metadata["excluded"])
    return rows, {"archive": archive, "members": members, "physicalRows": physical, "excluded": dict(sorted(excluded.items()))}


def load_validation():
    if not VALIDATION.is_file() or sha_file(VALIDATION) != EXPECTED_VALIDATION_SHA:
        raise RuntimeError("CORPUS_PREFLIGHT_FAILURE: validation SHA-256 mismatch")
    raw = VALIDATION.read_text(encoding="utf-8")
    if not raw.endswith("\n"):
        raise RuntimeError("CORPUS_PREFLIGHT_FAILURE: validation JSONL must end with a newline")
    rows = [json.loads(line) for line in raw.splitlines() if line]
    if len(rows) != EXPECTED_VALIDATION_ROWS:
        raise RuntimeError("CORPUS_PREFLIGHT_FAILURE: validation row count mismatch")
    prepared = []
    for row in rows:
        text, target, category = row.get("text"), row.get("target"), row.get("primaryCategory")
        if not isinstance(text, str) or not text.strip() or target not in (0, 1):
            raise RuntimeError("CORPUS_PREFLIGHT_FAILURE: validation schema mismatch")
        if target == 0 and category is not None:
            raise RuntimeError("CORPUS_PREFLIGHT_FAILURE: ALLOW row has a category")
        if target == 1 and category is not None and category not in CATEGORY_TO_ID:
            raise RuntimeError("CORPUS_PREFLIGHT_FAILURE: unsupported BLOCK category")
        prepared.append({"text": text, "target": target, "category": category or ("BINARY_ONLY_BLOCK" if target else None)})
    return prepared


def source_result(name, rows, metadata, predictions):
    labels = [row["target"] for row in rows]
    if len(predictions) != len(rows):
        raise RuntimeError("INFERENCE_FAILURE: prediction count mismatch")
    result = {
        "dataset": name,
        "physicalRows": metadata["physicalRows"],
        "evaluatedRows": len(rows),
        "excludedRows": metadata["physicalRows"] - len(rows),
        "exclusions": metadata["excluded"],
        "groundTruthCounts": {"ALLOW": labels.count(0), "BLOCK": labels.count(1)},
        "metrics": metric_values(labels, predictions),
    }
    for field, key in (("language", "languageSlices"), ("functionality", "functionalitySlices")):
        groups = defaultdict(lambda: ([], []))
        for row, prediction in zip(rows, predictions):
            if row.get(field):
                groups[row[field]][0].append(row["target"])
                groups[row[field]][1].append(prediction)
        if groups:
            result[key] = {name: metric_values(*values) for name, values in sorted(groups.items())}
    return result


def development_result(rows, predictions):
    result = source_result("DEVELOPMENT_VALIDATION", rows, {"physicalRows": len(rows), "excluded": {}}, predictions)
    category_recall = {}
    for category in BLOCK_CATEGORIES:
        category_predictions = [prediction for row, prediction in zip(rows, predictions) if row["category"] == category]
        category_recall[category] = sum(prediction == 1 for prediction in category_predictions) / len(category_predictions) if category_predictions else None
    result["blockRecallByCategory"] = category_recall
    result["auxiliaryCategoryAccuracy"] = None
    result["auxiliaryCategoryAccuracyNote"] = "Not computed: the reused helper exposes binary logits only."
    return result


def predict(rows):
    import torch
    from transformers import AutoConfig, AutoTokenizer

    if torch.cuda.is_available():
        raise RuntimeError("INFERENCE_FAILURE: this runner is CPU-only")
    tokenizer = AutoTokenizer.from_pretrained(MODEL, local_files_only=True, use_fast=True)
    config = AutoConfig.from_pretrained(MODEL, local_files_only=True)
    model = build_successor_model_class().from_pretrained(MODEL, config=config, local_files_only=True, use_safetensors=True)
    model.to("cpu").eval()
    predictions = []
    with torch.no_grad():
        for offset in range(0, len(rows), BATCH_SIZE):
            batch_rows = rows[offset:offset + BATCH_SIZE]
            batch = tokenizer([row["text"] for row in batch_rows], padding="longest", truncation=True, max_length=MAX_LENGTH, return_token_type_ids=False, return_tensors="pt")
            logits = model(**batch).logits
            predictions.extend(torch.argmax(logits, dim=1).tolist())
    return predictions


def write_new_json(path, value):
    path.write_text(canonical(value), encoding="utf-8", newline="\n")


def publish(results, manifest):
    if OUTPUT.exists():
        raise RuntimeError("OUTPUT_WRITE_FAILURE: evaluation output already exists; overwrite refused")
    staging = OUTPUT.with_name(OUTPUT.name + f".{os.getpid()}.partial")
    if staging.exists():
        raise RuntimeError("OUTPUT_WRITE_FAILURE: stale staging directory exists")
    try:
        staging.mkdir(parents=True)
        for name, result in results.items():
            write_new_json(staging / f"{name}.json", result)
        write_new_json(staging / "run-manifest.json", manifest)
        os.replace(staging, OUTPUT)
    except Exception:
        if staging.exists():
            shutil.rmtree(staging)
        raise


def preflight():
    model_file = MODEL / "model.safetensors"
    if not model_file.is_file() or sha_file(model_file) != EXPECTED_MODEL_SHA:
        raise RuntimeError("MODEL_PREFLIGHT_FAILURE: exported model SHA-256 mismatch")
    validation = load_validation()
    dynahate, dynahate_metadata = load_dynahate()
    hatecheck, hatecheck_metadata = load_hatecheck()
    multilingual, multilingual_metadata = load_multilingual_hatecheck()
    datasets = {
        "development-validation": (validation, {"physicalRows": len(validation), "excluded": {}, "path": VALIDATION}),
        "dynahate": (dynahate, dynahate_metadata),
        "hatecheck": (hatecheck, hatecheck_metadata),
        "multilingual-hatecheck": (multilingual, multilingual_metadata),
    }
    return datasets


def execute(datasets):
    predictions = {name: predict(rows) for name, (rows, _) in datasets.items()}
    results = {
        "development-validation": development_result(datasets["development-validation"][0], predictions["development-validation"]),
        "dynahate": source_result("DYNAHATE", *datasets["dynahate"], predictions["dynahate"]),
        "hatecheck": source_result("HATECHECK", *datasets["hatecheck"], predictions["hatecheck"]),
        "multilingual-hatecheck": source_result("MULTILINGUAL_HATECHECK", *datasets["multilingual-hatecheck"], predictions["multilingual-hatecheck"]),
    }
    combined_labels, combined_predictions = [], []
    for name in ("dynahate", "hatecheck", "multilingual-hatecheck"):
        combined_labels.extend(row["target"] for row in datasets[name][0])
        combined_predictions.extend(predictions[name])
    results["combined-diagnostics"] = {"datasets": ["DYNAHATE", "HATECHECK", "MULTILINGUAL_HATECHECK"], "evaluatedRows": len(combined_labels), "metrics": metric_values(combined_labels, combined_predictions)}
    manifest = {
        "schemaVersion": "STHN_EXPERIMENTAL_EXPANDED_DIAGNOSTIC_EVALUATION_V1",
        "terminalStatus": "COMPLETED",
        "model": {"path": str(MODEL.relative_to(ROOT)).replace("\\", "/"), "modelSha256": EXPECTED_MODEL_SHA, "decisionRule": "ARGMAX_BINARY_LOGITS", "batchSize": BATCH_SIZE, "maxLength": MAX_LENGTH},
        "sources": {"runnerSha256": sha_file(Path(__file__)), "customModelHelperSha256": sha_file(Path(__file__).with_name("mhs_v2_successor_model.py")), "validation": {"path": str(VALIDATION.relative_to(ROOT)).replace("\\", "/"), "sha256": EXPECTED_VALIDATION_SHA, "physicalRows": len(datasets["development-validation"][0]), "evaluatedRows": len(datasets["development-validation"][0]), "excludedRows": 0}},
        "diagnostics": {},
        "completedAt": now(),
    }
    for name in ("dynahate", "hatecheck", "multilingual-hatecheck"):
        _, metadata = datasets[name]
        archive = metadata["archive"]
        manifest["diagnostics"][name] = {"archivePath": str(archive.relative_to(ROOT)).replace("\\", "/"), "archiveSha256": sha_file(archive), "members": metadata.get("members", [metadata.get("member")]), "physicalRows": metadata["physicalRows"], "evaluatedRows": len(datasets[name][0]), "excludedRows": metadata["physicalRows"] - len(datasets[name][0])}
    publish(results, manifest)
    print("EXPERIMENTAL_DIAGNOSTIC_EVALUATION_COMPLETED", flush=True)


def main():
    parser = argparse.ArgumentParser(description="Local CPU diagnostic evaluator for the expanded-data text moderation model")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--preflight", action="store_true")
    mode.add_argument("--execute-local-evaluation", action="store_true")
    args = parser.parse_args()
    try:
        datasets = preflight()
        summary = {name: {"physicalRows": metadata["physicalRows"], "evaluatedRows": len(rows), "excludedRows": metadata["physicalRows"] - len(rows)} for name, (rows, metadata) in datasets.items()}
        print(canonical({"status": "PREFLIGHT_PASSED", "datasets": summary, "modelLoads": 0, "forwardPasses": 0, "trainingRuns": 0, "thresholdSelections": 0, "protectedDatasetAccesses": 0}), flush=True)
        if args.execute_local_evaluation:
            execute(datasets)
        return 0
    except Exception as error:
        print(f"{type(error).__name__}: {str(error).replace(chr(10), ' ')[:500]}", file=sys.stderr, flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
