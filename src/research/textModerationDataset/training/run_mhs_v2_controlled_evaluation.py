"""Authority-bound T6L-8D-C runner. T6L-8D-B may run only --preflight/--self-test."""
import argparse
import hashlib
import importlib.metadata
import json
import math
import os
import platform
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

os.environ["CUDA_VISIBLE_DEVICES"] = ""
os.environ["TOKENIZERS_PARALLELISM"] = "false"
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"

PHASE = "T6L-8D-C"
RUN_SCHEMA = "STHN_TEXT_MODERATION_MHS_V2_CONTROLLED_EVALUATION_RUN_V1"
RUN_VERSION = "MHS_V2_XLM_ROBERTA_FIRST_CONTROLLED_EVALUATION_V1"
MODEL_ID = "FacebookAI/xlm-roberta-base"
REVISION = "e73636d4f797dec63c3081bb6ed5c7b0bb3f2089"
MODEL_SHA = "3d5106067de09026d0739873734841338812c814211662c0336d68d5aa5a4f79"
CONFIG_SHA = "d6bb338e29a8273be512a372b5e08071aac1b736239234861952bbbecc294308"
TOKENIZER_SHA = "a898ea75433890f6610f4e470b8ebeb0c21dce5c8dd61f892eb09eb5919d2e2c"
TOKENIZER_BINDING_SHA = "14e87b41020fe70b01b1dfcf4c3250bd2e4f0b49caeaa7c5f8bdc1376f00d654"
CONTRACT_SHA = "1bc3f9a431b445db07c8426267108281d2ed165ffcf229bcd97c4d2174c1022e"
CONTRACT_PAYLOAD = "9b405c43758029ed58e11d7d877f3e9416ab2171465dcca456194c6ab2a2c79b"
CERTIFICATION_SHA = "43905ea77b4b00cc6d39603f4a6b92480abe796bd547d0109479579270e1372a"
CERTIFICATION_PAYLOAD = "41892951ce43c5f7b2256fd3c52de9373c596e875eb2c05c01f6707a62377b47"
RUN_MANIFEST_SHA = "b0465888ae65fa085c5b05b330f4241b0c0bf8f8f99562da9e2a4c88fb136e56"
RUN_MANIFEST_PAYLOAD = "defa433e83bd88215061ec593684b4d5d62c34b4693c9cee0d56d8fa0805d294"
RESULT_SUMMARY_SHA = "45c4b9ca6b5f20be06ee6b9468c107156ca4284fe3c75592b12ae9768404b805"
INTERNAL_FREEZE_SHA = "11036dd1961e709d77804123b3efdbafd6c083617ded6f608f674b1c0fedbc36"
INTERNAL_FREEZE_PAYLOAD = "23392bc4123a36fff1c5969c9bf01f7736105fc853a6fffac8d280e78b7464cb"
INTERNAL_MEMBERSHIP = "618fcec63bd963884e97efc353b2390f891f2c925103cca52be1f4df5180fd13"
SPLIT_SHA = "f9f2598cd63da5a64997c7741461b76ac738db0f41b9be44ba75822cb1deb37f"
CANDIDATE_SHA = "e8fa8da4042f3b87f7eba39e51671f7a21656a167c52f4801bb1429399ba1b5b"
BENCHMARK_SHA = "42f2d9dc5e4df6711f73b2c636ffff7085f45cfcd378e421e3d94e7acc967747"
BENCHMARK_VERSION = "STHN_TEXT_MODERATION_FIXTURES_V1R"
VERSIONS = {"python": "3.12.10", "torch": "2.3.1+cpu", "transformers": "4.42.4", "tokenizers": "0.19.1", "sentencepiece": "0.2.0", "safetensors": "0.4.3", "numpy": "1.26.4"}
PACKAGES = {key: key for key in VERSIONS if key != "python"}
OUTPUT_RELATIVE = "evaluation-cache/text-moderation/classifier-evaluation/mhs-v2-xlm-roberta-first-controlled-evaluation-v1"


def canonical(value):
    return json.dumps(value, sort_keys=True, indent=2, ensure_ascii=False, separators=(",", ": "), allow_nan=False) + "\n"


def now():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def sha_bytes(value):
    return hashlib.sha256(value).hexdigest()


def sha_file(filename):
    digest = hashlib.sha256()
    with open(filename, "rb") as handle:
        while block := handle.read(8 * 1024 * 1024):
            digest.update(block)
    return digest.hexdigest()


def payload_digest(value):
    return sha_bytes(canonical(value).encode("utf-8"))


def load_json(filename):
    return json.loads(Path(filename).read_text(encoding="utf-8"))


def write_new(filename, value):
    filename = Path(filename)
    filename.parent.mkdir(parents=True, exist_ok=True)
    temporary = filename.with_name(filename.name + f".{os.getpid()}.partial")
    if filename.exists() or temporary.exists():
        raise RuntimeError(f"OUTPUT_WRITE_FAILURE: overwrite refused: {filename}")
    temporary.write_text(canonical(value), encoding="utf-8", newline="\n")
    temporary.replace(filename)


def replace_json(filename, value):
    filename = Path(filename)
    temporary = filename.with_name(filename.name + f".{os.getpid()}.partial")
    temporary.write_text(canonical(value), encoding="utf-8", newline="\n")
    os.replace(temporary, filename)


def append_exposure(ledger, source, event):
    ledger = Path(ledger)
    existing = ledger.read_text(encoding="utf-8").splitlines() if ledger.exists() else []
    record = {"schemaVersion": "STHN_MHS_V2_PROTECTED_EXPOSURE_EVENT_V1", "ordinal": len(existing) + 1, "source": source, "event": event, "recordedAt": now(), "rawTextIncluded": False}
    with open(ledger, "a", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(record, sort_keys=True, ensure_ascii=False, separators=(",", ":")) + "\n")
        handle.flush(); os.fsync(handle.fileno())


def exposure_state(ledger):
    events = [json.loads(line) for line in Path(ledger).read_text(encoding="utf-8").splitlines() if line] if Path(ledger).exists() else []
    names = [event.get("event") for event in events]
    ordered = ["INTERNAL_TEST_ACCESS_STARTED", "INTERNAL_TEST_EVALUATION_COMPLETED", "EXTERNAL_BENCHMARK_ACCESS_STARTED", "EXTERNAL_BENCHMARK_EVALUATION_COMPLETED"]
    if names != ordered[:len(names)] or any(event.get("rawTextIncluded") is not False for event in events): raise RuntimeError("PROTECTED_EXPOSURE_LEDGER_INVALID")
    return {"internalTestAccessed": len(names) >= 1, "internalTestEvaluated": len(names) >= 2, "benchmarkAccessed": len(names) >= 3, "benchmarkEvaluated": len(names) >= 4, "complete": names == ordered}


def mark_failure(lifecycle_path, lifecycle, stage, error, status="FAILED"):
    state = {key: value for key, value in exposure_state(Path(lifecycle_path).parent / "protected-exposure-ledger.jsonl").items() if key != "complete"}
    lifecycle.update(state); lifecycle.update(status=status, completedAt=None, failure={"type": stage, "message": str(error).replace("\r", " ").replace("\n", " ")[:500], "recordedAt": now()}); replace_json(lifecycle_path, lifecycle)


def installed_versions():
    result = {"python": platform.python_version()}
    for key, package in PACKAGES.items():
        result[key] = importlib.metadata.version(package)
    return result


def repository_paths():
    backend = Path(__file__).resolve().parents[4]
    mhs = backend / "dataset-research/text-moderation/MEASURING_HATE_SPEECH"
    training_run = backend / "evaluation-cache/text-moderation/classifier-training/mhs-v2-xlm-roberta-first-run-v1"
    tokenizer_cache = backend / f"evaluation-cache/text-moderation/classifier/facebookai-xlm-roberta-base/{REVISION}"
    return backend, {
        "contract": mhs / "training/mhs-v2-controlled-evaluation-contract-v1.json",
        "certification": mhs / "training/mhs-v2-first-local-training-run-certification-v1.json",
        "training_manifest": training_run / "run/run-manifest.json", "training_summary": training_run / "run/result-summary.json",
        "model": training_run / "final/model.safetensors", "config": training_run / "final/config.json", "tokenizer_binding": training_run / "final/tokenizer-binding.json",
        "tokenizer": tokenizer_cache / "tokenizer.json", "tokenizer_cache": tokenizer_cache,
        "internal_freeze": mhs / "splits/mhs-internal-test-freeze-v1.json", "split": mhs / "splits/mhs-split-manifest-v1.json",
        "candidate": mhs / "candidates/mhs-review-pilot-v1-candidate-v1.json",
        "benchmark": backend / "src/evaluation/textModeration/textModerationFixtures.ts",
        "source_bridge": backend / "src/scripts/readMhsV2ProtectedEvaluationSource.ts",
        "output": backend / OUTPUT_RELATIVE,
    }


def exact_file(paths, name, expected):
    filename = paths[name]
    if not filename.is_file() or filename.is_symlink() or sha_file(filename) != expected:
        raise RuntimeError(f"AUTHORITY_PREFLIGHT_FAILURE: {name} SHA-256 mismatch")


def authority_preflight(require_empty_output=True, memory_diagnostics=None):
    backend, paths = repository_paths()
    expected_output = (backend / OUTPUT_RELATIVE).resolve()
    if paths["output"].resolve() != expected_output or paths["output"].is_symlink():
        raise RuntimeError("AUTHORITY_PREFLIGHT_FAILURE: unauthorized output root")
    if require_empty_output and paths["output"].exists():
        raise RuntimeError("AUTHORITY_PREFLIGHT_FAILURE: output root already exists; protected evaluation history cannot be overwritten")
    for name, expected in {"contract": CONTRACT_SHA, "certification": CERTIFICATION_SHA, "training_manifest": RUN_MANIFEST_SHA, "training_summary": RESULT_SUMMARY_SHA, "model": MODEL_SHA, "config": CONFIG_SHA, "tokenizer_binding": TOKENIZER_BINDING_SHA, "tokenizer": TOKENIZER_SHA, "internal_freeze": INTERNAL_FREEZE_SHA, "split": SPLIT_SHA, "candidate": CANDIDATE_SHA, "benchmark": BENCHMARK_SHA}.items():
        exact_file(paths, name, expected)
    contract, certification, training_manifest, binding, freeze = (load_json(paths[name]) for name in ("contract", "certification", "training_manifest", "tokenizer_binding", "internal_freeze"))
    # Exact artifact SHA plus its pinned, repository-canonical payload digest is the
    # cross-runtime authority; JS locale ordering is not reimplemented in Python.
    if contract.get("status") != "CONTROLLED_EVALUATION_CONTRACT_READY" or contract.get("contractPayloadDigest") != CONTRACT_PAYLOAD:
        raise RuntimeError("AUTHORITY_PREFLIGHT_FAILURE: controlled evaluation contract mismatch")
    if certification.get("status") != "FIRST_TRAINING_RUN_CERTIFIED" or certification.get("certificationPayloadDigest") != CERTIFICATION_PAYLOAD:
        raise RuntimeError("AUTHORITY_PREFLIGHT_FAILURE: training certification mismatch")
    if training_manifest.get("runPayloadDigest") != RUN_MANIFEST_PAYLOAD or training_manifest.get("terminalStatus") != "COMPLETED":
        raise RuntimeError("AUTHORITY_PREFLIGHT_FAILURE: training run manifest mismatch")
    candidate, preprocessing, execution, decision, authorities, output = (contract.get(key, {}) for key in ("candidate", "preprocessing", "execution", "decisionAndScores", "authorities", "output"))
    if candidate.get("finalModelSha256") != MODEL_SHA or candidate.get("selectedEpoch") != 3 or candidate.get("selectedCheckpoint") != "checkpoints/checkpoint-epoch-03" or candidate.get("labels") != {"0": "ALLOW", "1": "BLOCK"}:
        raise RuntimeError("AUTHORITY_PREFLIGHT_FAILURE: candidate identity mismatch")
    if binding != {"repository": MODEL_ID, "revision": REVISION, "tokenizerArtifactSha256": TOKENIZER_SHA, "trainingContractSha256": "df28bb1443a19baff12318b44f3da4abbe1d4492b73ab7b63a4221a9b5d645a9"}:
        raise RuntimeError("AUTHORITY_PREFLIGHT_FAILURE: tokenizer binding mismatch")
    if preprocessing.get("tokenizer") != "XLMRobertaTokenizerFast" or preprocessing.get("maxLength") != 160 or preprocessing.get("padding") != "DYNAMIC_LONGEST_IN_BATCH" or preprocessing.get("truncation") != "RIGHT" or preprocessing.get("tokenTypeIds") is not False or any(preprocessing.get(key) is not False for key in ("lowercase", "translation", "transliteration", "semanticNormalization")):
        raise RuntimeError("AUTHORITY_PREFLIGHT_FAILURE: preprocessing mismatch")
    if execution.get("device") != "CPU" or execution.get("precision") != "FP32" or execution.get("batchSize") != 8 or execution.get("evaluationMode") is not True or execution.get("gradientTracking") is not False or execution.get("shuffle") is not False:
        raise RuntimeError("AUTHORITY_PREFLIGHT_FAILURE: execution configuration mismatch")
    if decision.get("rule") != "ARGMAX_ALLOW_LOGIT_BLOCK_LOGIT" or decision.get("tieRule") != "LOWEST_LABEL_INDEX_ALLOW" or decision.get("productionThresholdStatus") != "NOT_SELECTED" or decision.get("thresholdSearch") is not False or decision.get("thresholdTuning") is not False:
        raise RuntimeError("AUTHORITY_PREFLIGHT_FAILURE: decision rule mismatch")
    internal, benchmark, prohibited = (authorities.get(key, {}) for key in ("internalTest", "externalBenchmark", "prohibitedPopulations"))
    if internal != {"version": "MHS_INTERNAL_TEST_FREEZE_V1", "sha256": INTERNAL_FREEZE_SHA, "payloadDigest": INTERNAL_FREEZE_PAYLOAD, "membershipDigest": INTERNAL_MEMBERSHIP, "count": 13, "decisionCounts": {"ALLOW": 9, "BLOCK": 4}} or benchmark != {"version": BENCHMARK_VERSION, "sha256": BENCHMARK_SHA, "count": 140} or prohibited != {"reserveCount": 256, "exclusionCount": 4, "authorizedForEvaluation": False}:
        raise RuntimeError("AUTHORITY_PREFLIGHT_FAILURE: protected-source authority mismatch")
    if freeze.get("candidateCount") != 13 or freeze.get("decisionComposition") != {"ALLOW": 9, "BLOCK": 4} or freeze.get("freezePayloadDigest") != INTERNAL_FREEZE_PAYLOAD or freeze.get("protectedMembershipDigest") != INTERNAL_MEMBERSHIP:
        raise RuntimeError("AUTHORITY_PREFLIGHT_FAILURE: INTERNAL_TEST freeze metadata mismatch")
    if output.get("root") != OUTPUT_RELATIVE or output.get("overwritePolicy") != "REFUSE_IF_ROOT_EXISTS":
        raise RuntimeError("AUTHORITY_PREFLIGHT_FAILURE: output contract mismatch")
    versions = installed_versions()
    if versions != VERSIONS:
        raise RuntimeError(f"DEPENDENCY_RUNTIME_FAILURE: exact environment required; observed {versions}")
    diagnostics = dict(memory_diagnostics or {})
    return {"backend": backend, "paths": paths, "contract": contract, "freeze": freeze, "versions": versions, "resourceDiagnostics": {"authoritativeForEligibility": False, **diagnostics}, "modelLoads": 0, "forwardPasses": 0, "protectedRawAccesses": 0}


def stable_softmax(logits):
    if not isinstance(logits, (list, tuple)) or len(logits) != 2 or any(not isinstance(value, (int, float)) or not math.isfinite(value) for value in logits):
        raise ValueError("NONFINITE_OR_MALFORMED_TWO_LOGIT_OUTPUT")
    maximum = max(logits); exponents = [math.exp(value - maximum) for value in logits]; total = sum(exponents); scores = [value / total for value in exponents]
    if not math.isfinite(total) or total <= 0 or any(not math.isfinite(value) for value in scores) or abs(sum(scores) - 1.0) > 1e-12:
        raise ValueError("NONFINITE_OR_INVALID_SOFTMAX")
    return scores


def prediction_from_logits(logits):
    stable_softmax(logits)
    return 0 if logits[0] >= logits[1] else 1


def metric_values(labels, predictions):
    if len(labels) != len(predictions) or not labels:
        raise ValueError("labels and predictions must be equally sized and non-empty")
    matrix = [[0, 0], [0, 0]]
    for actual, predicted in zip(labels, predictions):
        if actual not in (0, 1) or predicted not in (0, 1): raise ValueError("metrics require binary labels")
        matrix[actual][predicted] += 1
    per_class = {}
    for index, name in enumerate(("ALLOW", "BLOCK")):
        tp, fp, fn = matrix[index][index], matrix[1-index][index], matrix[index][1-index]
        precision = tp / (tp + fp) if tp + fp else 0.0; recall = tp / (tp + fn) if tp + fn else 0.0; f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        per_class[name] = {"precision": precision, "recall": recall, "f1": f1, "support": sum(matrix[index])}
    return {"count": len(labels), "groundTruthCounts": {"ALLOW": labels.count(0), "BLOCK": labels.count(1)}, "predictedCounts": {"ALLOW": predictions.count(0), "BLOCK": predictions.count(1)}, "confusionMatrix": matrix, "accuracy": (matrix[0][0] + matrix[1][1]) / len(labels), "allowPrecision": per_class["ALLOW"]["precision"], "allowRecall": per_class["ALLOW"]["recall"], "allowF1": per_class["ALLOW"]["f1"], "blockPrecision": per_class["BLOCK"]["precision"], "blockRecall": per_class["BLOCK"]["recall"], "blockF1": per_class["BLOCK"]["f1"], "macroF1": (per_class["ALLOW"]["f1"] + per_class["BLOCK"]["f1"]) / 2, "balancedAccuracy": (per_class["ALLOW"]["recall"] + per_class["BLOCK"]["recall"]) / 2}


def validate_source_rows(rows, source, expected_ids, expected_count, expected_counts=None):
    if len(rows) != expected_count or len({row.get("exampleId") for row in rows}) != expected_count: raise ValueError("SOURCE_ID_OR_ROW_COUNT_MISMATCH")
    if [row.get("exampleId") for row in rows] != expected_ids: raise ValueError("SOURCE_MISSING_OR_UNEXPECTED_ID")
    if expected_counts and {name: sum(row.get("trueDecision") == name for row in rows) for name in ("ALLOW", "BLOCK")} != expected_counts: raise ValueError("SOURCE_CLASS_COUNT_MISMATCH")
    for row in rows:
        if row.get("source") != source or row.get("trueDecision") not in ("ALLOW", "BLOCK") or row.get("trueTarget") != (0 if row.get("trueDecision") == "ALLOW" else 1) or not isinstance(row.get("text"), str) or sha_bytes(row["text"].encode("utf-8")) != row.get("textSha256"): raise ValueError("SOURCE_ROW_BINDING_MISMATCH")


def validate_result_record(record):
    required = {"source", "exampleId", "textSha256", "trueDecision", "trueTarget", "predictedDecision", "predictedTarget", "allowLogit", "blockLogit", "allowScore", "blockScore", "correct"}
    if set(record) - (required | {"metadata", "truncated"}) or not required.issubset(record) or any(key in record for key in ("text", "rawText", "content", "message")): raise ValueError("RAW_TEXT_OR_SCHEMA_VIOLATION")
    numeric = [record[key] for key in ("allowLogit", "blockLogit", "allowScore", "blockScore")]
    if any(not isinstance(value, (int, float)) or not math.isfinite(value) for value in numeric) or abs(record["allowScore"] + record["blockScore"] - 1.0) > 1e-12: raise ValueError("RESULT_NUMERIC_VIOLATION")


def load_protected_source(preflight, source):
    command = ["node", "-r", "ts-node/register", str(preflight["paths"]["source_bridge"]), source]
    result = subprocess.run(command, cwd=preflight["backend"], text=True, encoding="utf-8", capture_output=True, check=False)
    if result.returncode != 0: raise RuntimeError(f"PROTECTED_SOURCE_ACCESS_FAILURE: {source}: {result.stderr[-500:]}")
    return json.loads(result.stdout)


def evaluate_source(rows, source, tokenizer, model, torch):
    results = []
    for start in range(0, len(rows), 8):
        batch = rows[start:start+8]; texts = [row["text"] for row in batch]
        lengths = [len(tokenizer(text, add_special_tokens=True, truncation=False, return_attention_mask=False, return_token_type_ids=False)["input_ids"]) for text in texts]
        encoded = tokenizer(texts, padding="longest", truncation=True, max_length=160, add_special_tokens=True, return_attention_mask=True, return_token_type_ids=False, return_tensors="pt")
        with torch.inference_mode(): logits = model(**encoded).logits.detach().cpu().tolist()
        if len(logits) != len(batch): raise RuntimeError("INFERENCE_OUTPUT_ROW_COUNT_MISMATCH")
        for row, pair, length in zip(batch, logits, lengths):
            scores = stable_softmax(pair); predicted = prediction_from_logits(pair)
            record = {"source": source, "exampleId": row["exampleId"], "textSha256": row["textSha256"], "trueDecision": row["trueDecision"], "trueTarget": row["trueTarget"], "predictedDecision": "ALLOW" if predicted == 0 else "BLOCK", "predictedTarget": predicted, "allowLogit": float(pair[0]), "blockLogit": float(pair[1]), "allowScore": scores[0], "blockScore": scores[1], "correct": predicted == row["trueTarget"], "truncated": length > 160, "metadata": row.get("metadata", {})}
            validate_result_record(record); results.append(record)
    if len(results) != len(rows): raise RuntimeError("INFERENCE_RESULT_COUNT_MISMATCH")
    return results


def write_jsonl(filename, rows):
    text = "".join(json.dumps(row, sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n" for row in rows)
    if any(f'"{key}":' in text for key in ("text", "rawText", "content", "message")): raise RuntimeError("RAW_TEXT_OUTPUT_PROHIBITED")
    filename = Path(filename); filename.parent.mkdir(parents=True, exist_ok=True)
    with open(filename, "x", encoding="utf-8", newline="\n") as handle: handle.write(text)


def file_evidence(output, relative):
    filename = output / relative
    return {"path": relative.replace("\\", "/"), "byteSize": filename.stat().st_size, "sha256": sha_file(filename)}


def run_self_test():
    perfect = metric_values([0, 0, 1, 1], [0, 0, 1, 1]); zero = metric_values([0, 0, 1, 1], [0, 0, 0, 0])
    if perfect["confusionMatrix"] != [[2, 0], [0, 2]] or perfect["macroF1"] != 1 or zero["blockPrecision"] != 0 or zero["blockRecall"] != 0 or zero["blockF1"] != 0: raise RuntimeError("SELF_TEST_METRIC_FAILURE")
    if prediction_from_logits([1.0, 1.0]) != 0 or stable_softmax([1000.0, 999.0])[0] <= 0.5: raise RuntimeError("SELF_TEST_NUMERIC_FAILURE")
    for invalid in ([math.nan, 0.0], [math.inf, 0.0], [0.0], [0.0, 1.0, 2.0]):
        try: stable_softmax(invalid); raise RuntimeError("SELF_TEST_EXPECTED_NUMERIC_REJECTION")
        except ValueError: pass
    rows = [{"source": "SYNTHETIC", "exampleId": f"synthetic-{index}", "text": value, "textSha256": sha_bytes(value.encode()), "trueDecision": decision, "trueTarget": target} for index, (value, decision, target) in enumerate((("alpha", "ALLOW", 0), ("beta", "BLOCK", 1)), 1)]
    validate_source_rows(rows, "SYNTHETIC", ["synthetic-1", "synthetic-2"], 2, {"ALLOW": 1, "BLOCK": 1})
    for mutated in ([rows[0], rows[0]], rows[:1], rows + [{**rows[0], "exampleId": "unexpected"}]):
        try: validate_source_rows(mutated, "SYNTHETIC", ["synthetic-1", "synthetic-2"], 2, {"ALLOW": 1, "BLOCK": 1}); raise RuntimeError("SELF_TEST_EXPECTED_SOURCE_REJECTION")
        except ValueError: pass
    try: validate_result_record({"text": "forbidden"}); raise RuntimeError("SELF_TEST_EXPECTED_PRIVACY_REJECTION")
    except ValueError: pass
    with tempfile.TemporaryDirectory(prefix="sthn-8d-b-") as directory:
        run = Path(directory) / "run"; run.mkdir(); lifecycle = run / "lifecycle.json"; ledger = run / "protected-exposure-ledger.jsonl"
        write_new(lifecycle, {"status": "RUNNING", "internalTestAccessed": False, "benchmarkAccessed": False}); append_exposure(ledger, "INTERNAL_TEST", "INTERNAL_TEST_ACCESS_STARTED"); replace_json(lifecycle, {"status": "FAILED", "internalTestAccessed": True, "benchmarkAccessed": False})
        if "INTERNAL_TEST_ACCESS_STARTED" not in ledger.read_text() or load_json(lifecycle)["status"] != "FAILED": raise RuntimeError("SELF_TEST_EXPOSURE_FAILURE")
    print(canonical({"status": "SELF_TEST_PASSED", "syntheticOnly": True, "modelLoads": 0, "forwardPasses": 0, "protectedInference": 0, "protectedRawAccesses": 0, "trainingRuns": 0, "thresholdSelections": 0}))


def execute_authorized(preflight):
    import torch
    from transformers import AutoModelForSequenceClassification, AutoTokenizer
    if torch.cuda.is_available() or os.environ.get("CUDA_VISIBLE_DEVICES") != "": raise RuntimeError("RUNTIME_FAILURE: GPU/CUDA execution is prohibited")
    output = preflight["paths"]["output"]; output.mkdir(parents=True, exist_ok=False); run = output / "run"; run.mkdir()
    lifecycle_path, ledger = run / "lifecycle.json", run / "protected-exposure-ledger.jsonl"; started = now(); clock = time.monotonic()
    lifecycle = {"schemaVersion": "STHN_MHS_V2_CONTROLLED_EVALUATION_LIFECYCLE_V1", "phase": PHASE, "status": "RUNNING", "startedAt": started, "completedAt": None, "contractSha256": CONTRACT_SHA, "candidateSha256": MODEL_SHA, "internalTestAccessed": False, "internalTestEvaluated": False, "benchmarkAccessed": False, "benchmarkEvaluated": False, "protectedExposureLedger": "run/protected-exposure-ledger.jsonl"}
    write_new(lifecycle_path, lifecycle)
    stage = "MODEL_LOADING_FAILURE"
    try:
        tokenizer = AutoTokenizer.from_pretrained(preflight["paths"]["tokenizer_cache"], local_files_only=True, use_fast=True)
        model = AutoModelForSequenceClassification.from_pretrained(preflight["paths"]["model"].parent, local_files_only=True, use_safetensors=True).to(device="cpu", dtype=torch.float32)
        model.eval()
        for parameter in model.parameters(): parameter.requires_grad_(False)
        if next(model.parameters()).device.type != "cpu" or next(model.parameters()).dtype != torch.float32 or model.training or any(module.training for module in model.modules()) or any(parameter.requires_grad for parameter in model.parameters()): raise RuntimeError("MODEL_LOADING_FAILURE: CPU FP32 eval/no-gradient enforcement failed")
        stage = "INTERNAL_TEST_FAILURE"; append_exposure(ledger, "INTERNAL_TEST", "INTERNAL_TEST_ACCESS_STARTED"); lifecycle.update(internalTestAccessed=True); replace_json(lifecycle_path, lifecycle)
        internal = load_protected_source(preflight, "INTERNAL_TEST"); internal_ids = [row["candidateId"] for row in preflight["freeze"]["candidateIdentityIndex"]]
        validate_source_rows(internal, "INTERNAL_TEST", internal_ids, 13, {"ALLOW": 9, "BLOCK": 4}); internal_results = evaluate_source(internal, "INTERNAL_TEST", tokenizer, model, torch)
        internal_metrics = metric_values([row["trueTarget"] for row in internal_results], [row["predictedTarget"] for row in internal_results]); internal_metrics.update({"source": "INTERNAL_TEST", "warning": "INTERNAL_TEST_HAS_13_ROWS_HIGH_SAMPLING_VARIANCE_NO_PASS_FAIL_QUALITY_THRESHOLD", "truncationCount": sum(row["truncated"] for row in internal_results)})
        write_jsonl(output / "internal-test/predictions.jsonl", internal_results); write_new(output / "internal-test/metrics.json", internal_metrics); append_exposure(ledger, "INTERNAL_TEST", "INTERNAL_TEST_EVALUATION_COMPLETED"); lifecycle.update(internalTestEvaluated=True); replace_json(lifecycle_path, lifecycle)
        del internal, internal_results
        stage = "EXTERNAL_BENCHMARK_FAILURE"; append_exposure(ledger, "EXTERNAL_BENCHMARK", "EXTERNAL_BENCHMARK_ACCESS_STARTED"); lifecycle.update(benchmarkAccessed=True); replace_json(lifecycle_path, lifecycle)
        benchmark = load_protected_source(preflight, "EXTERNAL_BENCHMARK"); benchmark_ids = [f"sthn-tm-{index:03d}" for index in range(1, 141)]
        validate_source_rows(benchmark, "EXTERNAL_BENCHMARK", benchmark_ids, 140); benchmark_results = evaluate_source(benchmark, "EXTERNAL_BENCHMARK", tokenizer, model, torch)
        benchmark_metrics = metric_values([row["trueTarget"] for row in benchmark_results], [row["predictedTarget"] for row in benchmark_results]); benchmark_metrics.update({"source": "EXTERNAL_BENCHMARK", "sourceVersion": BENCHMARK_VERSION, "truncationCount": sum(row["truncated"] for row in benchmark_results)})
        write_jsonl(output / "external-benchmark/predictions.jsonl", benchmark_results); write_new(output / "external-benchmark/metrics.json", benchmark_metrics); append_exposure(ledger, "EXTERNAL_BENCHMARK", "EXTERNAL_BENCHMARK_EVALUATION_COMPLETED"); lifecycle.update(benchmarkEvaluated=True); replace_json(lifecycle_path, lifecycle)
        del benchmark, benchmark_results
        combined = {"schemaVersion": "STHN_MHS_V2_CONTROLLED_EVALUATION_COMBINED_ANALYSIS_V1", "sources": [{"source": "INTERNAL_TEST", "metrics": "internal-test/metrics.json", "count": 13}, {"source": "EXTERNAL_BENCHMARK", "metrics": "external-benchmark/metrics.json", "count": 140}], "independentMetricsPreserved": True, "pooledQualityMetric": None, "sourceWeighting": None, "productionThresholdStatus": "NOT_SELECTED", "qualityDecision": "NOT_AUTHORIZED_IN_T6L_8D_C"}
        write_new(output / "analysis/combined-analysis.json", combined)
        evidence = [file_evidence(output, item) for item in ("run/protected-exposure-ledger.jsonl", "internal-test/predictions.jsonl", "internal-test/metrics.json", "external-benchmark/predictions.jsonl", "external-benchmark/metrics.json", "analysis/combined-analysis.json")]
        manifest_payload = {"schemaVersion": RUN_SCHEMA, "runVersion": RUN_VERSION, "phase": PHASE, "terminalStatus": "COMPLETED", "authorities": {"controlledEvaluationContractSha256": CONTRACT_SHA, "controlledEvaluationContractPayloadDigest": CONTRACT_PAYLOAD, "trainingCertificationSha256": CERTIFICATION_SHA, "candidateSha256": MODEL_SHA, "tokenizerSha256": TOKENIZER_SHA, "internalTestFreezeSha256": INTERNAL_FREEZE_SHA, "internalTestMembershipDigest": INTERNAL_MEMBERSHIP, "externalBenchmarkVersion": BENCHMARK_VERSION, "externalBenchmarkSha256": BENCHMARK_SHA}, "configuration": {"device": "CPU", "precision": "FP32", "batchSize": 8, "maxLength": 160, "shuffle": False, "modelEval": True, "gradients": False, "optimizer": None, "scheduler": None, "decisionRule": "ARGMAX_TWO_LOGITS", "implementationRule": "ARGMAX_ALLOW_LOGIT_BLOCK_LOGIT", "tieRule": "LOWEST_LABEL_INDEX_ALLOW", "productionThresholdStatus": "NOT_SELECTED"}, "toolchain": preflight["versions"], "sources": {"INTERNAL_TEST": internal_metrics, "EXTERNAL_BENCHMARK": benchmark_metrics}, "artifacts": evidence, "lifecycle": {"startedAt": started, "endedAt": now(), "elapsedSeconds": time.monotonic() - clock}, "protectedExposureIrreversible": True, "trainingRuns": 0, "thresholdSelections": 0}
        manifest = {**manifest_payload, "runPayloadDigest": payload_digest(manifest_payload)}; write_new(run / "run-manifest.json", manifest)
        summary = {"status": "CONTROLLED_EVALUATION_COMPLETED", "runManifestSha256": sha_file(run / "run-manifest.json"), "internalTestCount": 13, "externalBenchmarkCount": 140, "sourceMetricsRemainIndependent": True, "modelQualityDecision": "NOT_AUTHORIZED", "productionThresholdStatus": "NOT_SELECTED", "protectedExposure": {"internalTest": True, "externalBenchmark": True}, "trainingRuns": 0, "thresholdSelections": 0}; write_new(run / "result-summary.json", summary)
        if not exposure_state(ledger)["complete"]: raise RuntimeError("COMPLETION_REQUIRES_BOTH_PROTECTED_SOURCES")
        lifecycle.update(status="COMPLETED", completedAt=now(), runManifestSha256=summary["runManifestSha256"], resultSummarySha256=sha_file(run / "result-summary.json")); replace_json(lifecycle_path, lifecycle)
        print("CONTROLLED_EVALUATION_COMPLETED", flush=True); print(canonical(summary), flush=True)
    except KeyboardInterrupt:
        mark_failure(lifecycle_path, lifecycle, stage, "Local controlled evaluation was interrupted", "INTERRUPTED"); raise
    except Exception as error:
        mark_failure(lifecycle_path, lifecycle, stage, error); raise


def main():
    parser = argparse.ArgumentParser(description="STHN authority-bound local controlled text-moderation evaluation runner")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--preflight", action="store_true")
    mode.add_argument("--self-test", action="store_true")
    mode.add_argument("--execute-authorized-local-evaluation", action="store_true")
    args = parser.parse_args()
    try:
        if args.self_test: run_self_test(); return 0
        preflight = authority_preflight(require_empty_output=True)
        print("AUTHORITY_PREFLIGHT_PASSED", flush=True)
        print(canonical({"status": "PREFLIGHT_PASSED", "outputRoot": OUTPUT_RELATIVE, "runtime": preflight["versions"], "resourceDiagnostics": preflight["resourceDiagnostics"], "modelLoads": 0, "forwardPasses": 0, "protectedInference": 0, "protectedRawAccesses": 0, "trainingRuns": 0, "thresholdSelections": 0, "writesPerformed": False}), flush=True)
        if args.preflight: return 0
        execute_authorized(preflight); return 0
    except KeyboardInterrupt:
        print("INTERRUPTED: controlled evaluation did not complete", file=sys.stderr, flush=True); return 130
    except Exception as error:
        print(f"{type(error).__name__}: {str(error)[:500]}", file=sys.stderr, flush=True); return 1


if __name__ == "__main__":
    raise SystemExit(main())
