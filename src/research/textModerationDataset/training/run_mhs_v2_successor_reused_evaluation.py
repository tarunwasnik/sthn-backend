"""Authority-bound T6L-8F successor reused-protected evaluation runner.

Preparation may run only --preflight and --self-test. The real execution mode
is reserved for the user's later manual invocation.
"""
import argparse
import hashlib
import importlib.metadata
import json
import math
import os
import platform
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

from mhs_v2_successor_reused_evaluation_metrics import (
    FORBIDDEN_FIELDS,
    build_result,
    comparison_bundle,
    metric_values,
    paired_join,
    predicted_target,
    stable_softmax,
    validate_complete_rows,
    validate_result,
)

os.environ["CUDA_VISIBLE_DEVICES"] = ""
os.environ["TOKENIZERS_PARALLELISM"] = "false"
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"

PHASE = "T6L-8F-C_USER_LOCAL_EXECUTION"
RUN_SCHEMA = "STHN_TEXT_MODERATION_MHS_V2_SUCCESSOR_REUSED_EVALUATION_RUN_V1"
RUN_VERSION = "MHS_V2_SUCCESSOR_REUSED_PROTECTED_EVALUATION_V1"
CYCLE_ID = "mhs-v2-successor-reused-protected-evaluation-cycle-v1-51ce8fb5f4cc29a4f6fed21f"
OUTPUT_RELATIVE = "evaluation-cache/text-moderation/classifier-evaluation/mhs-v2-xlm-roberta-category-aware-reused-protected-evaluation-v1"
METHODOLOGY_SHA = "62031d2a99fd89eb0280f15d3a96d740bd277422de4b271e30d61ef597377865"
METHODOLOGY_PAYLOAD = "aacdb93598825d9e5797441049daa8906a9cabd6438b15eb330c890d31eeaa54"
CONTRACT_SHA = "5c0053213dc3993424ab687d2800f2ed9716ba7f10dfbaa34fd863f5afaecb02"
CONTRACT_PAYLOAD = "0dfdcf4e0746d1c6a39acc4530c40780d59cf9f7471bc7361893db003a875d59"
CERTIFICATION_SHA = "00e6877a52a07bcaa23c472246f316e645ceb260ea5fd90991e1b95497a0ac34"
CERTIFICATION_PAYLOAD = "2545404d8aac500431f2ff5658c46272762bfdbefeb2f2243ec35d74e137e7e7"
D0_SHA = "494555916a7f0db88a5112fabcc078b48eea8cd8b2990ac863cc1a997bc32681"
D0_PAYLOAD = "4fbe8cca975da257db61ea895aa749d960b79a5ee3039b3710e570f8bf2fd3c5"
D0W_SHA = "ae4d33fc9e43cd6d7c23ab4a4302855c9eed2ba1fca638a5137ebf1d1148c29b"
D0W_PAYLOAD = "0738082cdaab0f6a8041560b5e58c5010b65bd11a6a6f7f1686659f6532c8253"
MODEL_SHA = "9c6f3e1033e5146bbd1eed3df6c68be2e2be9b1b5815afda3d41baa5a739ac3f"
CONFIG_SHA = "2f48155190967d11204a0ad87787a179e4ec0d708ac47e8730a1c8ed77f6ec78"
TOKENIZER_SHA = "a898ea75433890f6610f4e470b8ebeb0c21dce5c8dd61f892eb09eb5919d2e2c"
TOKENIZER_AUTHORITY_BINDING_SHA = "14e87b41020fe70b01b1dfcf4c3250bd2e4f0b49caeaa7c5f8bdc1376f00d654"
TOKENIZER_FINAL_BINDING_SHA = "151e78bcd3f3132a49671497baac2f7c8fa0af6808e6572a41b57b1d092a4629"
INTERNAL_FREEZE_SHA = "11036dd1961e709d77804123b3efdbafd6c083617ded6f608f674b1c0fedbc36"
INTERNAL_FREEZE_PAYLOAD = "23392bc4123a36fff1c5969c9bf01f7736105fc853a6fffac8d280e78b7464cb"
INTERNAL_MEMBERSHIP = "618fcec63bd963884e97efc353b2390f891f2c925103cca52be1f4df5180fd13"
BENCHMARK_SHA = "42f2d9dc5e4df6711f73b2c636ffff7085f45cfcd378e421e3d94e7acc967747"
BENCHMARK_VERSION = "STHN_TEXT_MODERATION_FIXTURES_V1R"
FIRST_CERTIFICATION_SHA = "8a08cb3cd8949b94013f5029003f4193842682b2119be71de394da4cee86c07a"
FIRST_RUN_MANIFEST_SHA = "e0d8bef728402d9efed635c31da67400d3ea095f38fd715aaa487fac14776718"
FIRST_INTERNAL_PREDICTIONS_SHA = "c535751b23fd6b51744c01245760d3c92361bb40e97d5e10ccdc16590192c7be"
FIRST_BENCHMARK_PREDICTIONS_SHA = "4681515a84c42e633a5d22693c9fabf7d432719e31af452c2d7427c320c80743"
VERSIONS = {"python": "3.12.10", "pytorch": "2.3.1+cpu", "transformers": "4.42.4", "accelerate": "0.31.0", "tokenizers": "0.19.1", "sentencepiece": "0.2.0", "safetensors": "0.4.3", "numpy": "1.26.4"}
PACKAGE_NAMES = {"pytorch": "torch", "transformers": "transformers", "accelerate": "accelerate", "tokenizers": "tokenizers", "sentencepiece": "sentencepiece", "safetensors": "safetensors", "numpy": "numpy"}
EVENT_ORDER = ["EVALUATION_CYCLE_INITIALIZED", "INTERNAL_TEST_ACCESS_STARTED", "INTERNAL_TEST_EVALUATION_COMPLETED", "EXTERNAL_BENCHMARK_ACCESS_STARTED", "EXTERNAL_BENCHMARK_EVALUATION_COMPLETED", "EVALUATION_CYCLE_COMPLETED"]


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


def atomic_text(filename, text, refuse_existing=True):
    filename = Path(filename)
    filename.parent.mkdir(parents=True, exist_ok=True)
    temporary = filename.with_name(filename.name + f".{os.getpid()}.partial")
    if (refuse_existing and filename.exists()) or temporary.exists():
        raise RuntimeError(f"OUTPUT_WRITE_FAILURE: overwrite refused: {filename.name}")
    with open(temporary, "x", encoding="utf-8", newline="\n") as handle:
        handle.write(text); handle.flush(); os.fsync(handle.fileno())
    os.replace(temporary, filename)


def write_new_json(filename, value):
    atomic_text(filename, canonical(value), True)


def replace_json(filename, value):
    atomic_text(filename, canonical(value), False)


def write_new_jsonl(filename, rows):
    text = "".join(json.dumps(row, sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n" for row in rows)
    if any(f'"{field}":' in text for field in FORBIDDEN_FIELDS):
        raise RuntimeError("RAW_OR_FORBIDDEN_OUTPUT_DETECTED")
    atomic_text(filename, text, True)


def installed_versions():
    result = {"python": platform.python_version()}
    for key, package in PACKAGE_NAMES.items(): result[key] = importlib.metadata.version(package)
    return result


def repository_paths():
    backend = Path(__file__).resolve().parents[4]
    mhs = backend / "dataset-research/text-moderation/MEASURING_HATE_SPEECH"
    evaluation = mhs / "evaluation"
    training = mhs / "training"
    successor = backend / "evaluation-cache/text-moderation/classifier-training/mhs-v2-xlm-roberta-category-aware-run-v1"
    first_training = backend / "evaluation-cache/text-moderation/classifier-training/mhs-v2-xlm-roberta-first-run-v1"
    first_evaluation = backend / "evaluation-cache/text-moderation/classifier-evaluation/mhs-v2-xlm-roberta-first-controlled-evaluation-v1"
    tokenizer_cache = backend / "evaluation-cache/text-moderation/classifier/facebookai-xlm-roberta-base/e73636d4f797dec63c3081bb6ed5c7b0bb3f2089"
    return backend, {
        "methodology": evaluation / "mhs-v2-successor-evaluation-methodology-v1.json",
        "contract": evaluation / "mhs-v2-successor-controlled-reused-evaluation-contract-v1.json",
        "preparation": evaluation / "mhs-v2-successor-local-controlled-reused-evaluation-runner-preparation-v1.json",
        "certification": training / "mhs-v2-successor-local-training-run-certification-v1.json",
        "d0": training / "mhs-v2-successor-training-provenance-recovery-v1.json", "d0w": training / "mhs-v2-successor-training-provenance-waiver-v1.json",
        "model": successor / "final/model.safetensors", "model_dir": successor / "final", "config": successor / "final/config.json",
        "tokenizer": tokenizer_cache / "tokenizer.json", "tokenizer_cache": tokenizer_cache,
        "tokenizer_authority_binding": first_training / "final/tokenizer-binding.json", "tokenizer_final_binding": successor / "final/tokenizer-binding.json",
        "internal_freeze": mhs / "splits/mhs-internal-test-freeze-v1.json", "first_certification": training / "mhs-v2-first-controlled-evaluation-certification-v1.json",
        "first_manifest": first_evaluation / "run/run-manifest.json", "first_internal_predictions": first_evaluation / "internal-test/predictions.jsonl", "first_benchmark_predictions": first_evaluation / "external-benchmark/predictions.jsonl",
        "runner": Path(__file__).resolve(), "metrics_helper": Path(__file__).resolve().parent / "mhs_v2_successor_reused_evaluation_metrics.py",
        "model_adapter": Path(__file__).resolve().parent / "mhs_v2_successor_model.py", "source_bridge": backend / "src/scripts/readMhsV2SuccessorProtectedEvaluationSource.ts",
        "protected_loader": backend / "src/research/textModerationDataset/mhsV2ProtectedEvaluationSources.ts", "output": backend / OUTPUT_RELATIVE,
    }


def exact_file(paths, name, expected):
    filename = paths[name]
    if not filename.is_file() or filename.is_symlink() or sha_file(filename) != expected:
        raise RuntimeError(f"AUTHORITY_PREFLIGHT_FAILURE: {name} SHA-256 mismatch")


def read_jsonl(filename):
    return [json.loads(line) for line in Path(filename).read_text(encoding="utf-8").splitlines() if line]


def ledger_events(ledger):
    return read_jsonl(ledger) if Path(ledger).exists() else []


def validate_ledger(events):
    names = [event.get("event") for event in events]
    if names != EVENT_ORDER[:len(names)]: raise RuntimeError("PROTECTED_EXPOSURE_LEDGER_ORDER_INVALID")
    for ordinal, event in enumerate(events, 1):
        if event.get("ordinal") != ordinal or event.get("cycleId") != CYCLE_ID or event.get("candidateSha256") != MODEL_SHA or event.get("contractSha256") != CONTRACT_SHA or event.get("rawTextIncluded") is not False:
            raise RuntimeError("PROTECTED_EXPOSURE_LEDGER_BINDING_INVALID")
    return names


def append_event(ledger, source, event):
    ledger = Path(ledger); existing = ledger_events(ledger); names = validate_ledger(existing)
    if len(names) >= len(EVENT_ORDER) or event != EVENT_ORDER[len(names)]: raise RuntimeError("PROTECTED_EXPOSURE_EVENT_ORDER_INVALID")
    record = {"schemaVersion": "STHN_MHS_V2_SUCCESSOR_PROTECTED_EXPOSURE_EVENT_V1", "ordinal": len(existing) + 1, "cycleId": CYCLE_ID, "candidateSha256": MODEL_SHA, "contractSha256": CONTRACT_SHA, "source": source, "event": event, "recordedAt": now(), "rawTextIncluded": False}
    ledger.parent.mkdir(parents=True, exist_ok=True)
    with open(ledger, "a", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(record, sort_keys=True, ensure_ascii=False, separators=(",", ":")) + "\n"); handle.flush(); os.fsync(handle.fileno())


def output_eligibility(output):
    output = Path(output)
    if not output.exists(): return "NEW"
    lifecycle_path, ledger = output / "run/lifecycle.json", output / "run/protected-exposure-ledger.jsonl"
    if not lifecycle_path.is_file() or not ledger.is_file(): raise RuntimeError("OUTPUT_ROOT_INELIGIBLE_OR_INCOMPLETE")
    lifecycle, names = load_json(lifecycle_path), validate_ledger(ledger_events(ledger))
    if lifecycle.get("cycleId") != CYCLE_ID: raise RuntimeError("OUTPUT_CYCLE_ID_MISMATCH")
    if lifecycle.get("status") == "FAILED_PRE_EXPOSURE" and names == ["EVALUATION_CYCLE_INITIALIZED"]: return "RETRY_SAME_ZERO_EXPOSURE_CYCLE"
    raise RuntimeError("OUTPUT_ROOT_EXISTS_AND_REPLAY_OR_POST_EXPOSURE_RETRY_IS_REFUSED")


def preparation_self_attestation(paths):
    preparation = load_json(paths["preparation"])
    if preparation.get("status") != "LOCAL_SUCCESSOR_CONTROLLED_REUSED_EVALUATION_READY": raise RuntimeError("PREPARATION_AUTHORITY_STATUS_MISMATCH")
    stored = preparation.get("preparationPayloadDigest"); payload = {key: value for key, value in preparation.items() if key != "preparationPayloadDigest"}
    if stored != payload_digest(payload): raise RuntimeError("PREPARATION_PAYLOAD_DIGEST_MISMATCH")
    implementation = preparation.get("implementation", {})
    actual = {name: sha_file(paths[name]) for name in ("runner", "metrics_helper", "model_adapter", "source_bridge", "protected_loader")}
    expected = {"runner": implementation.get("runner", {}).get("sha256"), "metrics_helper": implementation.get("metricsHelper", {}).get("sha256"), "model_adapter": implementation.get("modelAdapter", {}).get("sha256"), "source_bridge": implementation.get("protectedBridge", {}).get("sha256"), "protected_loader": implementation.get("protectedSourceLoader", {}).get("sha256")}
    if actual != expected: raise RuntimeError("EXECUTED_SOURCE_SELF_ATTESTATION_MISMATCH")
    return {"sha256": sha_file(paths["preparation"]), "payloadDigest": stored, "sourceSha256": actual}


def authority_preflight():
    backend, paths = repository_paths()
    if paths["output"].resolve() != (backend / OUTPUT_RELATIVE).resolve() or paths["output"].is_symlink(): raise RuntimeError("AUTHORITY_PREFLIGHT_FAILURE: unauthorized output root")
    pinned = {"methodology": METHODOLOGY_SHA, "contract": CONTRACT_SHA, "certification": CERTIFICATION_SHA, "d0": D0_SHA, "d0w": D0W_SHA, "model": MODEL_SHA, "config": CONFIG_SHA, "tokenizer": TOKENIZER_SHA, "tokenizer_authority_binding": TOKENIZER_AUTHORITY_BINDING_SHA, "tokenizer_final_binding": TOKENIZER_FINAL_BINDING_SHA, "internal_freeze": INTERNAL_FREEZE_SHA, "first_certification": FIRST_CERTIFICATION_SHA, "first_manifest": FIRST_RUN_MANIFEST_SHA, "first_internal_predictions": FIRST_INTERNAL_PREDICTIONS_SHA, "first_benchmark_predictions": FIRST_BENCHMARK_PREDICTIONS_SHA}
    for name, expected in pinned.items(): exact_file(paths, name, expected)
    methodology, contract, certification, d0, d0w, freeze = (load_json(paths[name]) for name in ("methodology", "contract", "certification", "d0", "d0w", "internal_freeze"))
    if (methodology.get("status"), methodology.get("methodologyPayloadDigest")) != ("CONTROLLED_REUSED_PROTECTED_COMPARISON_AUTHORIZED", METHODOLOGY_PAYLOAD): raise RuntimeError("AUTHORITY_PREFLIGHT_FAILURE: methodology mismatch")
    if (contract.get("status"), contract.get("contractPayloadDigest"), contract.get("evaluationCycle", {}).get("id"), contract.get("evaluationCycle", {}).get("outputRoot")) != ("SUCCESSOR_CONTROLLED_REUSED_EVALUATION_CONTRACT_READY", CONTRACT_PAYLOAD, CYCLE_ID, OUTPUT_RELATIVE): raise RuntimeError("AUTHORITY_PREFLIGHT_FAILURE: contract mismatch")
    if (certification.get("status"), certification.get("certificationPayloadDigest"), certification.get("checkpoints", {}).get("finalModelSha256")) != ("SUCCESSOR_TRAINING_RUN_CERTIFIED_WITH_PROVENANCE_WAIVER", CERTIFICATION_PAYLOAD, MODEL_SHA): raise RuntimeError("AUTHORITY_PREFLIGHT_FAILURE: certification mismatch")
    if d0.get("recoveryPayloadDigest") != D0_PAYLOAD or d0w.get("waiverPayloadDigest") != D0W_PAYLOAD or certification.get("provenanceWaiver", {}).get("code") != "MISSING_EXECUTED_SOURCE_BYTE_ATTESTATION" or certification.get("provenanceWaiver", {}).get("provenanceRecovered") is not False: raise RuntimeError("AUTHORITY_PREFLIGHT_FAILURE: provenance waiver mismatch")
    if freeze.get("candidateCount") != 13 or freeze.get("decisionComposition") != {"ALLOW": 9, "BLOCK": 4} or freeze.get("freezePayloadDigest") != INTERNAL_FREEZE_PAYLOAD or freeze.get("protectedMembershipDigest") != INTERNAL_MEMBERSHIP: raise RuntimeError("AUTHORITY_PREFLIGHT_FAILURE: INTERNAL_TEST metadata mismatch")
    first_internal, first_benchmark = read_jsonl(paths["first_internal_predictions"]), read_jsonl(paths["first_benchmark_predictions"])
    if len(first_internal) != 13 or len(first_benchmark) != 140 or any("text" in row or "rawText" in row for row in first_internal + first_benchmark): raise RuntimeError("AUTHORITY_PREFLIGHT_FAILURE: first prediction evidence mismatch")
    attestation = preparation_self_attestation(paths)
    versions = installed_versions()
    if versions != VERSIONS: raise RuntimeError(f"DEPENDENCY_RUNTIME_FAILURE: exact environment required; observed {versions}")
    eligibility = output_eligibility(paths["output"])
    disk = shutil.disk_usage(backend)
    return {"backend": backend, "paths": paths, "methodology": methodology, "contract": contract, "certification": certification, "freeze": freeze, "firstInternal": first_internal, "firstBenchmark": first_benchmark, "versions": versions, "preparationAttestation": attestation, "outputEligibility": eligibility, "resourceDiagnostics": {"authoritativeForEligibility": False, "diskFreeBytes": disk.free, "ramEligibilityGate": "NONE"}, "protectedRawTextAccesses": 0, "newProtectedInference": 0, "exposureEventsWritten": 0, "realModelLoads": 0, "realForwardPasses": 0}


def load_protected_source(preflight, source):
    command = ["node", "-r", "ts-node/register", str(preflight["paths"]["source_bridge"]), source]
    result = subprocess.run(command, cwd=preflight["backend"], text=True, encoding="utf-8", capture_output=True, check=False)
    if result.returncode != 0: raise RuntimeError(f"PROTECTED_SOURCE_ACCESS_FAILURE: {source}: bridge exited {result.returncode}")
    try: return json.loads(result.stdout)
    except json.JSONDecodeError as error: raise RuntimeError(f"PROTECTED_SOURCE_ACCESS_FAILURE: {source}: invalid bridge payload") from error


def validate_protected_rows(rows, source, expected_ids, expected_count, expected_counts=None):
    validate_complete_rows(rows, source, expected_ids, expected_count, expected_counts)
    allowed_metadata = {"primaryCategory"} if source == "INTERNAL_TEST" else {"domain", "target", "difficulty", "language", "tags", "expectedCategory"}
    for row in rows:
        if sha_bytes(row["text"].encode("utf-8")) != row["textSha256"]: raise ValueError("SOURCE_TEXT_DIGEST_MISMATCH")
        if set(row.get("metadata", {})) - allowed_metadata: raise ValueError("UNSUPPORTED_SOURCE_METADATA")


def evaluate_source(rows, source, tokenizer, model, torch):
    results = []
    for start in range(0, len(rows), 8):
        batch = rows[start:start + 8]; texts = [row["text"] for row in batch]
        lengths = [len(tokenizer(text, add_special_tokens=True, truncation=False, return_attention_mask=False, return_token_type_ids=False)["input_ids"]) for text in texts]
        encoded = tokenizer(texts, padding="longest", truncation=True, max_length=160, add_special_tokens=True, return_attention_mask=True, return_token_type_ids=False, return_tensors="pt")
        with torch.inference_mode(): binary_logits = model(**encoded).logits.detach().cpu().tolist()
        if len(binary_logits) != len(batch): raise RuntimeError("INFERENCE_OUTPUT_ROW_COUNT_MISMATCH")
        for row, logits, length in zip(batch, binary_logits, lengths): results.append(build_result(row, logits, length > 160))
    if len(results) != len(rows): raise RuntimeError("INFERENCE_RESULT_COUNT_MISMATCH")
    return results


def file_evidence(output, relative):
    filename = Path(output) / relative
    return {"path": relative.replace("\\", "/"), "byteSize": filename.stat().st_size, "sha256": sha_file(filename)}


def seal_source(output, source_slug, results, metrics, comparison):
    paths = [f"{source_slug}/predictions.jsonl", f"{source_slug}/metrics.json", f"{source_slug}/paired-comparison.json"]
    write_new_jsonl(Path(output) / paths[0], results); write_new_json(Path(output) / paths[1], metrics); write_new_json(Path(output) / paths[2], comparison)
    return [file_evidence(output, item) for item in paths]


def safe_error(error):
    message = str(error).replace("\r", " ").replace("\n", " ")
    return message[:300] if message else type(error).__name__


def mark_failure(lifecycle_path, lifecycle, ledger, stage, error, interrupted=False):
    names = validate_ledger(ledger_events(ledger)) if Path(ledger).exists() else []
    exposed = any(name.endswith("ACCESS_STARTED") for name in names)
    lifecycle.update(status=("INTERRUPTED_POST_EXPOSURE" if interrupted else "FAILED_POST_EXPOSURE") if exposed else "FAILED_PRE_EXPOSURE", completedAt=None, failure={"stage": stage, "type": type(error).__name__, "message": safe_error(error), "recordedAt": now()}, exposureEvents=len(names), cycleConsumed=exposed)
    replace_json(lifecycle_path, lifecycle)


def synthetic_rows(source, count, block_count=0):
    categories = ["ABUSIVE_OR_HARASSING"] * 11 + ["HATE"] * 10 + ["OTHER_INAPPROPRIATE"] * 5 + ["PROFANITY"] * 4 + ["SEXUAL"] * 18 + ["THREAT_OR_VIOLENCE"] * 25
    rows = []
    for index in range(count):
        target = 1 if index < block_count else 0; text = f"synthetic-only-{source.lower()}-{index + 1}"
        metadata = {}
        if source == "SYNTHETIC_BENCHMARK":
            metadata = {"difficulty": ("ADVERSARIAL", "CONTEXTUAL", "EASY")[index % 3], "language": ("en", "en-hi", "hi", "hi-Latn", "th")[index % 5], **({"expectedCategory": categories[index]} if target == 1 else {})}
        rows.append({"source": source, "exampleId": f"synthetic-{source.lower()}-{index + 1:03d}", "text": text, "textSha256": sha_bytes(text.encode()), "trueDecision": "BLOCK" if target else "ALLOW", "trueTarget": target, "metadata": metadata})
    return rows


def run_self_test():
    internal = synthetic_rows("SYNTHETIC_INTERNAL", 13, 4); benchmark = synthetic_rows("SYNTHETIC_BENCHMARK", 140, 73)
    first_internal = [build_result(row, [0.7, -0.2] if row["trueTarget"] == 0 else [0.2, 0.1]) for row in internal]
    successor_internal = [build_result(row, [0.8, -0.1] if row["trueTarget"] == 0 else [-0.1, 0.8]) for row in internal]
    first_benchmark = [build_result(row, [0.3, -0.1] if index % 2 else [-0.1, 0.3]) for index, row in enumerate(benchmark)]
    successor_benchmark = [build_result(row, [-0.2, 0.6] if row["trueTarget"] == 1 else [0.6, -0.2]) for row in benchmark]
    internal_bundle = comparison_bundle(first_internal, successor_internal, "INTERNAL_TEST"); benchmark_bundle = comparison_bundle(first_benchmark, successor_benchmark, "EXTERNAL_BENCHMARK")
    if sum(internal_bundle["pairedTransitions"].values()) != 13 or sum(benchmark_bundle["pairedTransitions"].values()) != 140 or [benchmark_bundle["category"][key]["total"] for key in ("ABUSIVE_OR_HARASSING", "HATE", "OTHER_INAPPROPRIATE", "PROFANITY", "SEXUAL", "THREAT_OR_VIOLENCE")] != [11, 10, 5, 4, 18, 25]: raise RuntimeError("SELF_TEST_COMPARISON_FAILURE")
    if predicted_target([1.0, 1.0]) != 0 or stable_softmax([1000.0, 999.0])[0] <= 0.5: raise RuntimeError("SELF_TEST_TIE_OR_SOFTMAX_FAILURE")
    for invalid in ([math.nan, 0.0], [math.inf, 0.0], [0.0], [0.0, 1.0, 2.0]):
        try: stable_softmax(invalid); raise RuntimeError("SELF_TEST_EXPECTED_NUMERIC_REJECTION")
        except ValueError: pass
    pairs = [(first_internal, successor_internal[1:]), (first_internal, successor_internal + [successor_internal[0]]), (first_internal, [successor_internal[0], successor_internal[0]] + successor_internal[2:]), (first_internal, [{**successor_internal[0], "textSha256": "0" * 64}] + successor_internal[1:]), (first_internal, [{**successor_internal[0], "trueTarget": 0}] + successor_internal[1:])]
    for first, successor in pairs:
        try: paired_join(first, successor); raise RuntimeError("SELF_TEST_EXPECTED_JOIN_REJECTION")
        except ValueError: pass
    leaked = dict(successor_internal[0]); leaked["auxiliaryLogits"] = [1, 2, 3, 4, 5]
    try: validate_result(leaked); raise RuntimeError("SELF_TEST_EXPECTED_AUXILIARY_REJECTION")
    except ValueError: pass
    with tempfile.TemporaryDirectory(prefix="sthn-8f-c-") as directory:
        output = Path(directory) / "synthetic-output"; run = output / "run"; run.mkdir(parents=True); lifecycle = run / "lifecycle.json"; ledger = run / "protected-exposure-ledger.jsonl"
        write_new_json(lifecycle, {"cycleId": CYCLE_ID, "status": "RUNNING"}); append_event(ledger, "CYCLE", "EVALUATION_CYCLE_INITIALIZED"); append_event(ledger, "INTERNAL_TEST", "INTERNAL_TEST_ACCESS_STARTED")
        replace_json(lifecycle, {"cycleId": CYCLE_ID, "status": "FAILED_POST_EXPOSURE"})
        try: output_eligibility(output); raise RuntimeError("SELF_TEST_EXPECTED_POST_EXPOSURE_REJECTION")
        except RuntimeError as error:
            if "REPLAY_OR_POST_EXPOSURE" not in str(error): raise
        atomic_target = output / "synthetic.json"; write_new_json(atomic_target, {"ok": True})
        try: write_new_json(atomic_target, {"ok": False}); raise RuntimeError("SELF_TEST_EXPECTED_REPLAY_REJECTION")
        except RuntimeError as error:
            if "overwrite refused" not in str(error): raise
        retry_output = Path(directory) / "retry"; retry_run = retry_output / "run"; retry_run.mkdir(parents=True); write_new_json(retry_run / "lifecycle.json", {"cycleId": CYCLE_ID, "status": "FAILED_PRE_EXPOSURE"}); append_event(retry_run / "protected-exposure-ledger.jsonl", "CYCLE", "EVALUATION_CYCLE_INITIALIZED")
        if output_eligibility(retry_output) != "RETRY_SAME_ZERO_EXPOSURE_CYCLE": raise RuntimeError("SELF_TEST_ZERO_EXPOSURE_RETRY_FAILURE")
    print(canonical({"status": "SELF_TEST_PASSED", "syntheticOnly": True, "syntheticRows": 153, "syntheticMockForwardPasses": 20, "realModelLoads": 0, "realForwardPasses": 0, "newProtectedInference": 0, "protectedRawTextAccesses": 0, "realExposureEventsWritten": 0, "trainingRuns": 0, "thresholdSelections": 0}))


def execute_authorized(preflight):
    import torch
    from transformers import AutoTokenizer
    from mhs_v2_successor_model import build_successor_model_class
    if torch.cuda.is_available() or os.environ.get("CUDA_VISIBLE_DEVICES") != "": raise RuntimeError("RUNTIME_FAILURE: GPU/CUDA execution is prohibited")
    output, eligibility = preflight["paths"]["output"], preflight["outputEligibility"]
    if eligibility == "NEW":
        output.mkdir(parents=True, exist_ok=False); run = output / "run"; run.mkdir(); lifecycle_path, ledger = run / "lifecycle.json", run / "protected-exposure-ledger.jsonl"
        append_event(ledger, "CYCLE", "EVALUATION_CYCLE_INITIALIZED")
        lifecycle = {"schemaVersion": "STHN_MHS_V2_SUCCESSOR_REUSED_EVALUATION_LIFECYCLE_V1", "phase": PHASE, "cycleId": CYCLE_ID, "status": "RUNNING", "startedAt": now(), "completedAt": None, "contractSha256": CONTRACT_SHA, "methodologySha256": METHODOLOGY_SHA, "candidateSha256": MODEL_SHA, "sourceOrder": ["INTERNAL_TEST", "EXTERNAL_BENCHMARK"], "cycleConsumed": False, "protectedExposureLedger": "run/protected-exposure-ledger.jsonl"}
        write_new_json(lifecycle_path, lifecycle)
    else:
        run = output / "run"; lifecycle_path, ledger = run / "lifecycle.json", run / "protected-exposure-ledger.jsonl"; lifecycle = load_json(lifecycle_path); lifecycle.update(status="RUNNING", failure=None, retryOfSameZeroExposureCycle=True); replace_json(lifecycle_path, lifecycle)
    clock = time.monotonic(); stage = "MODEL_LOADING_FAILURE"
    try:
        tokenizer = AutoTokenizer.from_pretrained(preflight["paths"]["tokenizer_cache"], local_files_only=True, use_fast=True)
        model_class = build_successor_model_class()
        model = model_class.from_pretrained(preflight["paths"]["model_dir"], local_files_only=True, use_safetensors=True).to(device="cpu", dtype=torch.float32)
        model.eval()
        for parameter in model.parameters(): parameter.requires_grad_(False)
        if next(model.parameters()).device.type != "cpu" or next(model.parameters()).dtype != torch.float32 or model.training or any(parameter.requires_grad for parameter in model.parameters()): raise RuntimeError("MODEL_LOADING_FAILURE: CPU FP32 eval/no-gradient enforcement failed")
        print("MODEL_LOADED", flush=True)
        stage = "INTERNAL_TEST_FAILURE"; append_event(ledger, "INTERNAL_TEST", "INTERNAL_TEST_ACCESS_STARTED"); lifecycle.update(cycleConsumed=True, currentSource="INTERNAL_TEST"); replace_json(lifecycle_path, lifecycle); print("INTERNAL_TEST_ACCESS_STARTED", flush=True)
        internal = load_protected_source(preflight, "INTERNAL_TEST"); internal_ids = [item["candidateId"] for item in preflight["freeze"]["candidateIdentityIndex"]]
        validate_protected_rows(internal, "INTERNAL_TEST", internal_ids, 13, {"ALLOW": 9, "BLOCK": 4}); internal_results = evaluate_source(internal, "INTERNAL_TEST", tokenizer, model, torch); internal_comparison = comparison_bundle(preflight["firstInternal"], internal_results, "INTERNAL_TEST"); internal_metrics = {**metric_values(internal_results), "source": "INTERNAL_TEST", "warning": "SMALL_REUSED_13_ROW_HIGH_VARIANCE_NO_PASS_FAIL_THRESHOLD", "truncationCount": sum(row["truncated"] for row in internal_results)}
        evidence = seal_source(output, "internal-test", internal_results, internal_metrics, internal_comparison); del internal, internal_results
        append_event(ledger, "INTERNAL_TEST", "INTERNAL_TEST_EVALUATION_COMPLETED"); lifecycle.update(internalTestSealed=True); replace_json(lifecycle_path, lifecycle); print("INTERNAL_TEST_COMPLETED", flush=True)
        stage = "EXTERNAL_BENCHMARK_FAILURE"; append_event(ledger, "EXTERNAL_BENCHMARK", "EXTERNAL_BENCHMARK_ACCESS_STARTED"); lifecycle.update(currentSource="EXTERNAL_BENCHMARK"); replace_json(lifecycle_path, lifecycle); print("BENCHMARK_ACCESS_STARTED", flush=True)
        benchmark = load_protected_source(preflight, "EXTERNAL_BENCHMARK"); benchmark_ids = [f"sthn-tm-{index:03d}" for index in range(1, 141)]
        validate_protected_rows(benchmark, "EXTERNAL_BENCHMARK", benchmark_ids, 140, {"ALLOW": 67, "BLOCK": 73}); benchmark_results = evaluate_source(benchmark, "EXTERNAL_BENCHMARK", tokenizer, model, torch); benchmark_comparison = comparison_bundle(preflight["firstBenchmark"], benchmark_results, "EXTERNAL_BENCHMARK"); benchmark_metrics = {**metric_values(benchmark_results), "source": "EXTERNAL_BENCHMARK", "sourceVersion": BENCHMARK_VERSION, "truncationCount": sum(row["truncated"] for row in benchmark_results)}
        evidence += seal_source(output, "external-benchmark", benchmark_results, benchmark_metrics, benchmark_comparison); del benchmark, benchmark_results
        write_new_json(output / "analysis/paired-comparison.json", {"classification": "CONTROLLED_REUSED_PROTECTED_COMPARISON", "pooled153RowMetric": None, "statistics": "DESCRIPTIVE_PAIRED_COMPARISON_ONLY", "INTERNAL_TEST": internal_comparison, "EXTERNAL_BENCHMARK": benchmark_comparison}); evidence.append(file_evidence(output, "analysis/paired-comparison.json"))
        append_event(ledger, "EXTERNAL_BENCHMARK", "EXTERNAL_BENCHMARK_EVALUATION_COMPLETED"); lifecycle.update(benchmarkSealed=True); replace_json(lifecycle_path, lifecycle); print("BENCHMARK_COMPLETED", flush=True)
        append_event(ledger, "CYCLE", "EVALUATION_CYCLE_COMPLETED")
        summary = {"schemaVersion": "STHN_MHS_V2_SUCCESSOR_REUSED_EVALUATION_RESULT_SUMMARY_V1", "status": "SUCCESSOR_CONTROLLED_REUSED_EVALUATION_COMPLETED", "evaluationClassification": "CONTROLLED_REUSED_PROTECTED_COMPARISON", "qualification": "DEVELOPMENT_INFLUENTIAL_REUSED_SOURCES_NOT_INDEPENDENT_PRODUCTION_ESTIMATE", "cycleId": CYCLE_ID, "successorModelSha256": MODEL_SHA, "firstCandidateCertificationSha256": FIRST_CERTIFICATION_SHA, "INTERNAL_TEST": internal_comparison, "EXTERNAL_BENCHMARK": benchmark_comparison, "provenanceWaiver": "MISSING_EXECUTED_SOURCE_BYTE_ATTESTATION", "globalWinner": None, "qualityPassFailVerdict": None, "productionThresholdStatus": "NOT_SELECTED", "productionAuthorized": False, "rawTextIncluded": False}
        write_new_json(run / "result-summary.json", summary); evidence.append(file_evidence(output, "run/result-summary.json")); evidence.append(file_evidence(output, "run/protected-exposure-ledger.jsonl"))
        manifest_payload = {"schemaVersion": RUN_SCHEMA, "runVersion": RUN_VERSION, "phase": PHASE, "terminalStatus": "COMPLETED", "cycleId": CYCLE_ID, "authorities": {"methodology": {"sha256": METHODOLOGY_SHA, "payloadDigest": METHODOLOGY_PAYLOAD}, "contract": {"sha256": CONTRACT_SHA, "payloadDigest": CONTRACT_PAYLOAD}, "preparation": preflight["preparationAttestation"], "successorCertification": {"sha256": CERTIFICATION_SHA, "payloadDigest": CERTIFICATION_PAYLOAD}, "provenanceWaiver": {"code": "MISSING_EXECUTED_SOURCE_BYTE_ATTESTATION", "provenanceRecovered": False}, "successorModelSha256": MODEL_SHA, "tokenizerSha256": TOKENIZER_SHA, "tokenizerBindingSha256": TOKENIZER_AUTHORITY_BINDING_SHA, "internalTest": {"sha256": INTERNAL_FREEZE_SHA, "payloadDigest": INTERNAL_FREEZE_PAYLOAD, "membershipDigest": INTERNAL_MEMBERSHIP}, "benchmark": {"version": BENCHMARK_VERSION, "sha256": BENCHMARK_SHA}, "firstPredictions": {"manifestSha256": FIRST_RUN_MANIFEST_SHA, "internalTestSha256": FIRST_INTERNAL_PREDICTIONS_SHA, "benchmarkSha256": FIRST_BENCHMARK_PREDICTIONS_SHA}}, "runtime": {"device": "CPU", "precision": "FP32", "batchSize": 8, "workers": 0, "gradients": False, "modelEval": True, "toolchain": preflight["versions"], "resourceDiagnostics": preflight["resourceDiagnostics"]}, "preprocessing": {"exactUnicode": True, "maxLength": 160, "padding": "DYNAMIC_RIGHT", "truncation": "DETERMINISTIC_RIGHT", "mutation": False}, "decision": {"rule": "ARGMAX_ALLOW_LOGIT_BLOCK_LOGIT", "tie": "ALLOW", "scoreSemantics": "UNCALIBRATED_MODEL_SCORE", "auxiliaryObservation": "PROHIBITED", "auxiliaryComputation": "TRANSIENT_UNOBSERVED"}, "sources": {"INTERNAL_TEST": internal_metrics, "EXTERNAL_BENCHMARK": benchmark_metrics}, "artifacts": evidence, "exposure": {"ledgerSha256": sha_file(ledger), "events": len(ledger_events(ledger)), "cycleConsumed": True, "remainingAuthorizedCycles": 0}, "threshold": "NOT_SELECTED", "productionAuthorized": False, "trainingRuns": 0, "lifecycle": {"startedAt": lifecycle["startedAt"], "endedAt": now(), "elapsedSeconds": time.monotonic() - clock}}
        manifest = {**manifest_payload, "runPayloadDigest": payload_digest(manifest_payload)}; write_new_json(run / "run-manifest.json", manifest)
        lifecycle.update(status="COMPLETED", completedAt=now(), currentSource=None, runManifestSha256=sha_file(run / "run-manifest.json"), resultSummarySha256=sha_file(run / "result-summary.json"), exposureLedgerSha256=sha_file(ledger), remainingAuthorizedCycles=0); replace_json(lifecycle_path, lifecycle)
        print("SUCCESSOR_CONTROLLED_REUSED_EVALUATION_COMPLETED", flush=True); print(canonical({"status": summary["status"], "cycleId": CYCLE_ID, "runManifestSha256": lifecycle["runManifestSha256"], "resultSummarySha256": lifecycle["resultSummarySha256"], "productionThresholdStatus": "NOT_SELECTED", "productionAuthorized": False}), flush=True)
    except KeyboardInterrupt as error:
        mark_failure(lifecycle_path, lifecycle, ledger, stage, error, True); raise
    except Exception as error:
        mark_failure(lifecycle_path, lifecycle, ledger, stage, error); raise


def main():
    parser = argparse.ArgumentParser(description="STHN successor controlled reused-protected evaluation runner")
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument("--preflight", action="store_true"); modes.add_argument("--self-test", action="store_true"); modes.add_argument("--execute-authorized-local-run", action="store_true")
    args = parser.parse_args()
    try:
        if args.self_test: run_self_test(); return 0
        preflight = authority_preflight(); print("AUTHORITY_PREFLIGHT_PASSED", flush=True)
        print(canonical({"status": "PREFLIGHT_PASSED", "cycleId": CYCLE_ID, "outputRoot": OUTPUT_RELATIVE, "outputEligibility": preflight["outputEligibility"], "runtime": preflight["versions"], "resourceDiagnostics": preflight["resourceDiagnostics"], "realModelLoads": 0, "realForwardPasses": 0, "newProtectedInference": 0, "protectedRawTextAccesses": 0, "exposureEventsWritten": 0, "trainingRuns": 0, "thresholdSelections": 0, "writesPerformed": False}), flush=True)
        if args.preflight: return 0
        execute_authorized(preflight); return 0
    except KeyboardInterrupt:
        print("INTERRUPTED: successor reused evaluation did not complete", file=sys.stderr, flush=True); return 130
    except Exception as error:
        print(f"{type(error).__name__}: {safe_error(error)}", file=sys.stderr, flush=True); return 1


if __name__ == "__main__": raise SystemExit(main())
