"""Authority-bound T6L-8C2 local CPU runner. T6L-8C1 may execute only --preflight/--self-test."""
import argparse
import hashlib
import importlib.metadata
import json
import math
import os
import platform
import random
import shutil
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

os.environ["CUDA_VISIBLE_DEVICES"] = ""
os.environ["TOKENIZERS_PARALLELISM"] = "false"
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"

PHASE = "T6L-8C2"
RUN_SCHEMA = "STHN_TEXT_MODERATION_MHS_V2_FIRST_LOCAL_TRAINING_RUN_V1"
RUN_VERSION = "MHS_V2_XLM_ROBERTA_FIRST_LOCAL_TRAINING_RUN_V1"
REVISION = "e73636d4f797dec63c3081bb6ed5c7b0bb3f2089"
MODEL_ID = "FacebookAI/xlm-roberta-base"
SEED_STRING = "STHN_T6L_8B_MHS_V2_FIRST_TRAINING_RUN_V1"
SEED = 1538422894
BASE_WEIGHT_BYTES = 1115567652
BASE_WEIGHT_SHA = "6fd4797bc397c3b8b55d6bb5740366b57e6a3ce91c04c77f22aafc0c128e6feb"
TOKENIZER_SHA = "a898ea75433890f6610f4e470b8ebeb0c21dce5c8dd61f892eb09eb5919d2e2c"
EXPECTED = {
    "preparation": "ca5e696b739ad6aee1651e7dd039df5db7eadd8face4ad46d397e0c307f75b56",
    "environment": "3db1643fe6d65b1b0725751dde56088a70317ae9ae60bc83b5c7a880af85a9d8",
    "contract": "df28bb1443a19baff12318b44f3da4abbe1d4492b73ab7b63a4221a9b5d645a9",
    "training_ready": "62d6139891fb56b2c6d0c2c18f63aa7e20000ef02fbd33e3bf9308a5ee90f6c1",
    "materialization": "eb4372cc839052870163d7d83fc9834281121a29622456fe6db10d8585b18a67",
    "train": "fa9eaeb3fa519ded246bffda1fb57902ca2fcae4c64fb10968d430fab4a4bf74",
    "validation": "5c01425c9c7e6e1f4348e38a98eaf1740898c3ba98f2bb6114d77175631b0d29",
    "release": "a001c63cf1d4674d9dcad89c9e630348ce3e1461a6e8cd12971b813724e65ec7",
    "eligibility": "1201be0665a82b03ab9e056e8bad16737afaf8cf6159602fde3ecf8cf00d7649",
    "classifier": "ca9cd876c9facd4b310a5cd9f09385113ce3e8c1376d2e5fd0a3b654ff2a17f1",
}
PAYLOADS = {
    "preparation": "2386fbcbabd7319d6d8d7420bbe39679e87c9e542703400d3fed828fc0bef864",
    "environment": "3bf378d5d0c44089de38be4e17b774a3ebb80adcbf6b1c8a2bad274a516ba52d",
    "contract": "9ef954a82382daf971c1d2cfe8e91cf5fdfb4e3ab18a511ffa85b8e6eb6e3c6e",
    "training_ready": "51fdbbfa4b4df15fbf5c3e64aa090c66c923a45ce12e91f35dd4024d4295e0ee",
    "train": "f2c0e863db5169bf3989b3cdf72e2e71efdb71da982540bbfdebd8dc560f03ff",
    "validation": "a1c46eff57f8ee501440fa92eb86f990d8a8648d425a771fd48bbe72447be095",
}
TRAIN_MEMBERSHIP = "6bc66f7d0fdb28d7213c84a0c0dc3be6f607f6c6dc7400ac8e3e84497bdbad61"
VALIDATION_MEMBERSHIP = "2c3e7cc4372c266e3bab8d42a092c74807351c09563f38f46ba0da8fd8eb8164"
VERSIONS = {"python": "3.12.10", "pytorch": "2.3.1+cpu", "transformers": "4.42.4", "accelerate": "0.31.0", "tokenizers": "0.19.1", "sentencepiece": "0.2.0", "safetensors": "0.4.3", "numpy": "1.26.4"}
PACKAGE_NAMES = {"pytorch": "torch", "transformers": "transformers", "accelerate": "accelerate", "tokenizers": "tokenizers", "sentencepiece": "sentencepiece", "safetensors": "safetensors", "numpy": "numpy"}


def canonical(value):
    return json.dumps(value, sort_keys=True, indent=2, ensure_ascii=False, separators=(",", ": ")) + "\n"


def sha_file(filename):
    digest = hashlib.sha256()
    with open(filename, "rb") as handle:
        while block := handle.read(8 * 1024 * 1024):
            digest.update(block)
    return digest.hexdigest()


def payload_digest(value):
    return hashlib.sha256(canonical(value).encode("utf-8")).hexdigest()


def now():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def atomic_json(filename, value):
    filename = Path(filename)
    temporary = filename.with_name(filename.name + f".{os.getpid()}.partial")
    if filename.exists() or temporary.exists():
        raise RuntimeError(f"CHECKPOINT_WRITE_FAILURE: overwrite refused: {filename.name}")
    temporary.write_text(canonical(value), encoding="utf-8", newline="\n")
    temporary.replace(filename)


def load_json(filename):
    return json.loads(Path(filename).read_text(encoding="utf-8"))


def load_jsonl(filename):
    text = Path(filename).read_text(encoding="utf-8")
    if not text.endswith("\n"):
        raise RuntimeError("AUTHORITY_PREFLIGHT_FAILURE: malformed authorized JSONL")
    return [json.loads(line) for line in text[:-1].split("\n") if line]


def metric_values(labels, predictions):
    if len(labels) != len(predictions) or not labels:
        raise ValueError("labels and predictions must be equally sized and non-empty")
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
        "accuracy": sum(matrix[i][i] for i in (0, 1)) / len(labels),
        "blockPrecision": per_class["BLOCK"]["precision"],
        "blockRecall": per_class["BLOCK"]["recall"],
        "blockF1": per_class["BLOCK"]["f1"],
        "macroF1": (per_class["ALLOW"]["f1"] + per_class["BLOCK"]["f1"]) / 2,
        "balancedAccuracy": (per_class["ALLOW"]["recall"] + per_class["BLOCK"]["recall"]) / 2,
        "perClass": per_class,
    }


def select_checkpoint(epochs):
    if len(epochs) != 3:
        raise ValueError("exactly three epoch metrics are required")
    return sorted(epochs, key=lambda row: (-row["macroF1"], row["validationLoss"], row["epoch"]))[0]


def repository_paths():
    backend = Path(__file__).resolve().parents[4]
    mhs = backend / "dataset-research/text-moderation/MEASURING_HATE_SPEECH"
    training = mhs / "training"
    materialized = mhs / "materialized"
    cache = backend / f"evaluation-cache/text-moderation/classifier/facebookai-xlm-roberta-base/{REVISION}"
    output = backend / "evaluation-cache/text-moderation/classifier-training/mhs-v2-xlm-roberta-first-run-v1"
    return backend, cache, output, {
        "preparation": training / "mhs-v2-training-preparation-analysis-v1.json",
        "environment": training / "mhs-v2-training-environment-authority-v1.json",
        "contract": training / "mhs-v2-xlm-roberta-training-contract-v1.json",
        "training_ready": materialized / "mhs-training-ready-certification-v2.json",
        "materialization": materialized / "mhs-materialization-manifest-v2.json",
        "train": materialized / "mhs-train-v2.jsonl",
        "validation": materialized / "mhs-validation-v2.jsonl",
        "release": mhs / "release/mhs-release-manifest-v2.json",
        "eligibility": mhs / "release/mhs-training-eligibility-manifest-v2.json",
        "classifier": backend / "dataset-research/text-moderation/model-authority/xlm-roberta-base-classifier-authority-v1.json",
    }


def installed_versions():
    versions = {"python": platform.python_version()}
    for key, package in PACKAGE_NAMES.items():
        versions[key] = importlib.metadata.version(package)
    return versions


def resource_precheck(output):
    import psutil
    memory = psutil.virtual_memory()
    disk = shutil.disk_usage(output.parent if output.parent.exists() else output.parents[1])
    warnings = []
    result = {"logicalProcessors": psutil.cpu_count(logical=True), "physicalCores": psutil.cpu_count(logical=False), "totalRamBytes": memory.total, "availableRamBytes": memory.available, "freeDiskBytes": disk.free, "warnings": warnings}
    if memory.total < 7 * 1024**3:
        raise RuntimeError("RESOURCE_PRECHECK_FAILURE: an 8 GB-class machine is required")
    if disk.free < 12 * 1024**3:
        raise RuntimeError("RESOURCE_PRECHECK_FAILURE: at least 12 GiB free disk is required")
    if memory.available < 4 * 1024**3:
        warnings.append("LOW_AVAILABLE_RAM_CLOSE_OTHER_APPLICATIONS_BEFORE_TRAINING")
    return result


def validate_payload_authority(name, artifact, digest_field):
    stated = artifact.get(digest_field)
    # The exact canonical artifact SHA is checked first. The recorded digest is then
    # pinned directly; JS locale ordering differs from Python's Unicode key ordering.
    if stated != PAYLOADS[name]:
        raise RuntimeError(f"AUTHORITY_PREFLIGHT_FAILURE: {name} payload mismatch")


def authority_preflight(require_empty_output=True):
    backend, cache, output, paths = repository_paths()
    expected_output = (backend / "evaluation-cache/text-moderation/classifier-training/mhs-v2-xlm-roberta-first-run-v1").resolve()
    if output.resolve() != expected_output or output.is_symlink():
        raise RuntimeError("AUTHORITY_PREFLIGHT_FAILURE: unauthorized output root")
    if require_empty_output and output.exists():
        raise RuntimeError("AUTHORITY_PREFLIGHT_FAILURE: output root already exists; automatic cleanup is prohibited")
    for name, filename in paths.items():
        if not filename.is_file() or sha_file(filename) != EXPECTED[name]:
            raise RuntimeError(f"AUTHORITY_PREFLIGHT_FAILURE: {name} SHA mismatch")
    preparation, environment, contract, ready = (load_json(paths[name]) for name in ("preparation", "environment", "contract", "training_ready"))
    validate_payload_authority("preparation", preparation, "preparationPayloadDigest")
    validate_payload_authority("environment", environment, "environmentPayloadDigest")
    validate_payload_authority("contract", contract, "contractPayloadDigest")
    validate_payload_authority("training_ready", ready, "certificationPayloadDigest")
    authorities = contract.get("authorities", {})
    if contract.get("status") != "TRAINING_CONTRACT_READY" or ready.get("status") != "TRAINING_READY_AUTHORIZED":
        raise RuntimeError("AUTHORITY_PREFLIGHT_FAILURE: readiness status mismatch")
    if authorities.get("trainMembershipDigest") != TRAIN_MEMBERSHIP or authorities.get("validationMembershipDigest") != VALIDATION_MEMBERSHIP:
        raise RuntimeError("AUTHORITY_PREFLIGHT_FAILURE: membership authority mismatch")
    model, tokenizer = contract.get("model", {}), contract.get("tokenizer", {})
    if model.get("repository") != MODEL_ID or model.get("revision") != REVISION or model.get("architecture") != "XLMRobertaForSequenceClassification" or model.get("numLabels") != 2 or model.get("baseWeightSha256") != BASE_WEIGHT_SHA:
        raise RuntimeError("AUTHORITY_PREFLIGHT_FAILURE: model contract mismatch")
    if tokenizer.get("identity") != "XLMRobertaTokenizerFast" or tokenizer.get("revision") != REVISION or tokenizer.get("artifactSha256") != TOKENIZER_SHA:
        raise RuntimeError("AUTHORITY_PREFLIGHT_FAILURE: tokenizer contract mismatch")
    if contract.get("dataset", {}).get("label2id") != {"ALLOW": 0, "BLOCK": 1} or contract.get("dataset", {}).get("feature") != ["text"]:
        raise RuntimeError("AUTHORITY_PREFLIGHT_FAILURE: feature/label contract mismatch")
    frozen = (contract.get("preprocessing", {}), contract.get("batching", {}), contract.get("optimization", {}), contract.get("reproducibility", {}), contract.get("runtime", {}))
    preprocessing, batching, optimization, reproducibility, runtime = frozen
    if preprocessing.get("maxLength") != 160 or preprocessing.get("padding") != "DYNAMIC_LONGEST_IN_BATCH" or preprocessing.get("truncation") != "RIGHT" or preprocessing.get("truncationCount") != 0:
        raise RuntimeError("AUTHORITY_PREFLIGHT_FAILURE: preprocessing contract mismatch")
    if batching.get("trainPhysicalBatchSize") != 8 or batching.get("validationBatchSize") != 8 or batching.get("gradientAccumulationSteps") != 1 or batching.get("effectiveBatchSize") != 8 or batching.get("dataLoaderWorkers") != 0:
        raise RuntimeError("AUTHORITY_PREFLIGHT_FAILURE: batching contract mismatch")
    if optimization.get("optimizer") != "ADAMW_TORCH" or optimization.get("learningRate") != 2e-5 or optimization.get("betas") != [0.9, 0.999] or optimization.get("epsilon") != 1e-8 or optimization.get("weightDecay") != 0.01 or optimization.get("warmup", {}).get("steps") != 2 or optimization.get("epochs") != 3 or optimization.get("maxGradientNorm") != 1 or optimization.get("totalOptimizerSteps") != 75:
        raise RuntimeError("AUTHORITY_PREFLIGHT_FAILURE: optimization contract mismatch")
    if reproducibility.get("masterSeed") != SEED or reproducibility.get("masterSeedString") != SEED_STRING or runtime.get("device") != "CPU_REQUIRED_FIRST_BASELINE" or runtime.get("cudaAllowed") is not False:
        raise RuntimeError("AUTHORITY_PREFLIGHT_FAILURE: seed/runtime contract mismatch")
    versions = installed_versions()
    if versions != VERSIONS:
        raise RuntimeError(f"DEPENDENCY_RUNTIME_FAILURE: exact environment required; observed {versions}")
    weight, tokenizer_file = cache / "model.safetensors", cache / "tokenizer.json"
    if not weight.is_file() or weight.stat().st_size != BASE_WEIGHT_BYTES or sha_file(weight) != BASE_WEIGHT_SHA:
        raise RuntimeError("AUTHORITY_PREFLIGHT_FAILURE: base model identity mismatch")
    if not tokenizer_file.is_file() or sha_file(tokenizer_file) != TOKENIZER_SHA:
        raise RuntimeError("AUTHORITY_PREFLIGHT_FAILURE: tokenizer identity mismatch")
    train, validation = load_jsonl(paths["train"]), load_jsonl(paths["validation"])
    validate_rows(train, "TRAIN", 200, 110, 90)
    validate_rows(validation, "VALIDATION", 13, 9, 4)
    resources = resource_precheck(output)
    return {"backend": backend, "cache": cache, "output": output, "paths": paths, "contract": contract, "train": train, "validation": validation, "versions": versions, "resources": resources}


def validate_rows(rows, split, expected, allow, block):
    if len(rows) != expected or len({row.get("exampleId") for row in rows}) != expected:
        raise RuntimeError(f"AUTHORITY_PREFLIGHT_FAILURE: {split} membership/count mismatch")
    if sum(row.get("decision") == "ALLOW" for row in rows) != allow or sum(row.get("decision") == "BLOCK" for row in rows) != block:
        raise RuntimeError(f"AUTHORITY_PREFLIGHT_FAILURE: {split} label distribution mismatch")
    for row in rows:
        expected_target = 0 if row.get("decision") == "ALLOW" else 1 if row.get("decision") == "BLOCK" else None
        if row.get("split") != split or row.get("target") != expected_target or hashlib.sha256(row.get("text", "").encode("utf-8")).hexdigest() != row.get("candidateTextDigest"):
            raise RuntimeError(f"AUTHORITY_PREFLIGHT_FAILURE: {split} row binding mismatch")


def file_records(root):
    return [{"filename": str(item.relative_to(root)).replace("\\", "/"), "byteSize": item.stat().st_size, "sha256": sha_file(item)} for item in sorted(root.rglob("*")) if item.is_file()]


def run_self_test():
    perfect = metric_values([0, 0, 1, 1], [0, 0, 1, 1])
    zero = metric_values([0, 0, 1, 1], [0, 0, 0, 0])
    tie = select_checkpoint([{"epoch": 1, "macroF1": 0.5, "validationLoss": 0.4}, {"epoch": 2, "macroF1": 0.5, "validationLoss": 0.3}, {"epoch": 3, "macroF1": 0.5, "validationLoss": 0.3}])
    if perfect["confusionMatrix"] != [[2, 0], [0, 2]] or perfect["accuracy"] != 1 or perfect["balancedAccuracy"] != 1 or zero["blockPrecision"] != 0 or zero["blockRecall"] != 0 or zero["blockF1"] != 0 or tie["epoch"] != 2:
        raise RuntimeError("SELF_TEST_FAILURE")
    print(canonical({"status": "SELF_TEST_PASSED", "modelInstantiated": False, "forwardPasses": 0, "backwardPasses": 0, "optimizerSteps": 0, "checkpointsCreated": 0}))


def execute_training(preflight):
    # This function is intentionally reachable only through the explicit manual 8C2 flag.
    import numpy as np
    import psutil
    import torch
    from torch.utils.data import Dataset
    from transformers import AutoConfig, AutoModelForSequenceClassification, AutoTokenizer, Trainer, TrainerCallback, TrainingArguments, set_seed

    if torch.cuda.is_available() or os.environ.get("CUDA_VISIBLE_DEVICES") != "":
        raise RuntimeError("DEPENDENCY_RUNTIME_FAILURE: GPU execution is prohibited")
    if psutil.virtual_memory().available < 4 * 1024**3:
        raise RuntimeError("RESOURCE_PRECHECK_FAILURE: at least 4 GiB available RAM is required before model loading; close other applications and retry")
    output, cache = preflight["output"], preflight["cache"]
    output.mkdir(parents=True, exist_ok=False)
    run_dir, checkpoints, final_dir = output / "run", output / "checkpoints", output / "final"
    run_dir.mkdir(); checkpoints.mkdir(); final_dir.mkdir()
    lifecycle = {"phase": PHASE, "status": "RUNNING", "startedAt": now(), "completedAt": None, "trainingContractSha256": EXPECTED["contract"]}
    atomic_json(run_dir / "lifecycle.json", lifecycle)
    started = time.monotonic()

    class Rows(Dataset):
        def __init__(self, rows): self.rows = rows
        def __len__(self): return len(self.rows)
        def __getitem__(self, index): return {"text": self.rows[index]["text"], "label": self.rows[index]["target"]}

    class Collator:
        def __init__(self, tokenizer): self.tokenizer = tokenizer
        def __call__(self, features):
            batch = self.tokenizer([row["text"] for row in features], padding="longest", truncation=True, max_length=160, add_special_tokens=True, return_attention_mask=True, return_token_type_ids=False, return_tensors="pt")
            batch["labels"] = torch.tensor([row["label"] for row in features], dtype=torch.int64)
            return batch

    class Progress(TrainerCallback):
        def on_epoch_begin(self, args, state, control, **kwargs): print(f"EPOCH_START {int(state.epoch or 0)+1}/3", flush=True)
        def on_step_end(self, args, state, control, **kwargs): print(f"TRAINING_PROGRESS {state.global_step}/75", flush=True)
        def on_epoch_end(self, args, state, control, **kwargs): print(f"VALIDATION_START epoch={int(round(state.epoch))}", flush=True)
        def on_log(self, args, state, control, logs=None, **kwargs):
            if logs and "loss" in logs: print(f"EPOCH_TRAINING_LOSS epoch={int(round(state.epoch))} loss={float(logs['loss'])}", flush=True)
        def on_evaluate(self, args, state, control, metrics=None, **kwargs): print("VALIDATION_COMPLETE " + json.dumps({key: value for key, value in (metrics or {}).items() if key.startswith("eval_")}, sort_keys=True), flush=True)
        def on_save(self, args, state, control, **kwargs): print(f"CHECKPOINT_WRITTEN step={state.global_step}", flush=True)

    class TieBreak(TrainerCallback):
        def __init__(self): self.best = None
        def on_evaluate(self, args, state, control, metrics=None, **kwargs):
            if not metrics: return control
            current = (float(metrics["eval_macro_f1"]), float(metrics["eval_loss"]), int(round(state.epoch)))
            if self.best is not None and current[0] == self.best[0] and current[1] < self.best[1] and state.best_metric is not None: state.best_metric = current[0] - 1e-12
            if self.best is None or (-current[0], current[1], current[2]) < (-self.best[0], self.best[1], self.best[2]): self.best = current
            print(f"CHECKPOINT_SELECTION_STATE epoch={current[2]} macroF1={current[0]} validationLoss={current[1]} currentBestEpoch={self.best[2]}", flush=True)
            return control

    def trainer_metrics(prediction):
        labels = np.asarray(prediction.label_ids, dtype=np.int64)
        predicted = np.argmax(prediction.predictions, axis=1)
        metrics = metric_values(labels.tolist(), predicted.tolist())
        return {"accuracy": metrics["accuracy"], "block_precision": metrics["blockPrecision"], "block_recall": metrics["blockRecall"], "block_f1": metrics["blockF1"], "macro_f1": metrics["macroF1"], "balanced_accuracy": metrics["balancedAccuracy"], "cm_allow_allow": metrics["confusionMatrix"][0][0], "cm_allow_block": metrics["confusionMatrix"][0][1], "cm_block_allow": metrics["confusionMatrix"][1][0], "cm_block_block": metrics["confusionMatrix"][1][1]}

    stage = "TRAINING_RUNTIME_FAILURE"
    try:
        random.seed(SEED); np.random.seed(SEED); torch.manual_seed(SEED); set_seed(SEED)
        torch.use_deterministic_algorithms(True, warn_only=False); torch.backends.cudnn.deterministic = True; torch.backends.cudnn.benchmark = False; torch.backends.cuda.matmul.allow_tf32 = False
        print("AUTHORITY_PREFLIGHT_PASSED", flush=True)
        stage = "TOKENIZATION_FAILURE"
        print("TOKENIZER_LOADING_LOCAL", flush=True)
        tokenizer = AutoTokenizer.from_pretrained(cache, local_files_only=True, use_fast=True)
        print("TOKENIZER_LOADING_COMPLETE", flush=True)
        stage = "MODEL_LOADING_FAILURE"
        print("MODEL_LOADING_LOCAL_CPU", flush=True)
        config = AutoConfig.from_pretrained(cache, local_files_only=True, num_labels=2, label2id={"ALLOW": 0, "BLOCK": 1}, id2label={0: "ALLOW", 1: "BLOCK"}, hidden_dropout_prob=0.1, attention_probs_dropout_prob=0.1, classifier_dropout=0.1)
        model = AutoModelForSequenceClassification.from_pretrained(cache, config=config, local_files_only=True, use_safetensors=True)
        if next(model.parameters()).device.type != "cpu" or model.num_labels != 2: raise RuntimeError("MODEL_LOADING_FAILURE: CPU classifier identity mismatch")
        print("MODEL_LOADING_COMPLETE", flush=True)
        stage = "TRAINING_RUNTIME_FAILURE"
        print("DATASET_COUNTS TRAIN=200 VALIDATION=13", flush=True)
        arguments = TrainingArguments(output_dir=str(checkpoints), overwrite_output_dir=False, num_train_epochs=3, per_device_train_batch_size=8, per_device_eval_batch_size=8, gradient_accumulation_steps=1, learning_rate=2e-5, weight_decay=0.01, adam_beta1=0.9, adam_beta2=0.999, adam_epsilon=1e-8, max_grad_norm=1.0, lr_scheduler_type="linear", warmup_steps=2, evaluation_strategy="epoch", save_strategy="epoch", logging_strategy="epoch", save_total_limit=2, load_best_model_at_end=True, metric_for_best_model="macro_f1", greater_is_better=True, seed=SEED, data_seed=SEED, dataloader_num_workers=0, use_cpu=True, fp16=False, bf16=False, tf32=False, full_determinism=True, remove_unused_columns=False, report_to=[], optim="adamw_torch", save_safetensors=True)
        trainer = Trainer(model=model, args=arguments, train_dataset=Rows(preflight["train"]), eval_dataset=Rows(preflight["validation"]), data_collator=Collator(tokenizer), compute_metrics=trainer_metrics, callbacks=[Progress(), TieBreak()])
        result = trainer.train()
        if trainer.state.global_step != 75: raise RuntimeError("TRAINING_RUNTIME_FAILURE: optimizer-step accounting mismatch")
        stage = "VALIDATION_FAILURE"
        epoch_metrics, training_losses = [], []
        for row in trainer.state.log_history:
            if "loss" in row and "eval_loss" not in row: training_losses.append({"epoch": int(round(row["epoch"])), "loss": float(row["loss"])})
            if "eval_macro_f1" in row:
                epoch_metrics.append({"epoch": int(round(row["epoch"])), "globalStep": int(row["step"]), "trainingLoss": next((item["loss"] for item in training_losses if item["epoch"] == int(round(row["epoch"]))), None), "validationLoss": float(row["eval_loss"]), "confusionMatrix": [[int(row["eval_cm_allow_allow"]), int(row["eval_cm_allow_block"])], [int(row["eval_cm_block_allow"]), int(row["eval_cm_block_block"])]], "accuracy": float(row["eval_accuracy"]), "blockPrecision": float(row["eval_block_precision"]), "blockRecall": float(row["eval_block_recall"]), "blockF1": float(row["eval_block_f1"]), "macroF1": float(row["eval_macro_f1"]), "balancedAccuracy": float(row["eval_balanced_accuracy"])})
        if len(epoch_metrics) != 3 or [row["globalStep"] for row in epoch_metrics] != [25, 50, 75]: raise RuntimeError("VALIDATION_FAILURE: evaluation accounting mismatch")
        numeric_results = [item for row in epoch_metrics for item in (row["trainingLoss"], row["validationLoss"], row["accuracy"], row["blockPrecision"], row["blockRecall"], row["blockF1"], row["macroF1"], row["balancedAccuracy"])]
        if any(item is None or not math.isfinite(item) for item in numeric_results):
            stage = "NAN_INF_FAILURE"
            raise RuntimeError("NAN_INF_FAILURE: non-finite training or validation metric")
        selected_metric = select_checkpoint(epoch_metrics)
        stage = "CHECKPOINT_WRITE_FAILURE"
        selected_original = checkpoints / f"checkpoint-{selected_metric['globalStep']}"
        if not selected_original.is_dir(): raise RuntimeError("CHECKPOINT_WRITE_FAILURE: selected checkpoint was not retained")
        if not trainer.state.best_model_checkpoint or Path(trainer.state.best_model_checkpoint).resolve() != selected_original.resolve(): raise RuntimeError("CHECKPOINT_WRITE_FAILURE: trainer selection diverged from frozen tie-break rule")
        trainer.model.save_pretrained(final_dir, safe_serialization=True)
        atomic_json(final_dir / "tokenizer-binding.json", {"repository": MODEL_ID, "revision": REVISION, "tokenizerArtifactSha256": TOKENIZER_SHA, "trainingContractSha256": EXPECTED["contract"]})
        retained = []
        for directory in sorted(checkpoints.glob("checkpoint-*"), key=lambda item: int(item.name.split("-")[-1])):
            step = int(directory.name.split("-")[-1]); epoch = step // 25; target = checkpoints / f"checkpoint-epoch-{epoch:02d}"; directory.rename(target)
            retained.append({"epoch": epoch, "globalStep": step, "path": str(target.relative_to(output)).replace("\\", "/"), "files": file_records(target)})
        selected_path = f"checkpoints/checkpoint-epoch-{selected_metric['epoch']:02d}"
        ended = now(); duration = time.monotonic() - started
        manifest_payload = {"schemaVersion": RUN_SCHEMA, "runVersion": RUN_VERSION, "phase": PHASE, "runId": "mhs-v2-xlm-roberta-first-local-run-v1", "terminalStatus": "COMPLETED", "authorities": {"trainingContractSha256": EXPECTED["contract"], "trainingContractPayloadDigest": PAYLOADS["contract"], "preparationSha256": EXPECTED["preparation"], "preparationPayloadDigest": PAYLOADS["preparation"], "environmentSha256": EXPECTED["environment"], "environmentPayloadDigest": PAYLOADS["environment"], "trainingReadySha256": EXPECTED["training_ready"], "trainingReadyPayloadDigest": PAYLOADS["training_ready"], "trainSha256": EXPECTED["train"], "trainPayloadDigest": PAYLOADS["train"], "trainMembershipDigest": TRAIN_MEMBERSHIP, "validationSha256": EXPECTED["validation"], "validationPayloadDigest": PAYLOADS["validation"], "validationMembershipDigest": VALIDATION_MEMBERSHIP}, "baseModel": {"repository": MODEL_ID, "revision": REVISION, "weightSha256": BASE_WEIGHT_SHA, "tokenizerSha256": TOKENIZER_SHA}, "toolchain": preflight["versions"], "hardware": {"device": "cpu", "cudaVisibleDevices": "", "cudaAvailable": False, "cpu": platform.processor() or os.environ.get("PROCESSOR_IDENTIFIER", "unknown"), "logicalProcessors": psutil.cpu_count(logical=True), "physicalCores": psutil.cpu_count(logical=False), "totalRamBytes": psutil.virtual_memory().total}, "seed": {"string": SEED_STRING, "integer": SEED}, "configuration": {"maxLength": 160, "trainBatchSize": 8, "validationBatchSize": 8, "gradientAccumulation": 1, "optimizer": "AdamW", "learningRate": 2e-5, "betas": [0.9, 0.999], "epsilon": 1e-8, "weightDecay": 0.01, "scheduler": "linear", "warmupSteps": 2, "epochs": 3, "maxGradNorm": 1.0, "precision": "FP32", "decisionRule": "ARGMAX_TWO_LOGITS"}, "steps": {"batchesPerEpoch": 25, "totalOptimizerSteps": 75, "schedulerSteps": 75, "validationEvaluations": 3}, "epochs": epoch_metrics, "checkpointHistory": [{"epoch": epoch, "globalStep": epoch * 25, "retained": any(item["epoch"] == epoch for item in retained)} for epoch in (1, 2, 3)], "retainedCheckpoints": retained, "selectedCheckpoint": {**selected_metric, "path": selected_path}, "selectionRule": ["HIGHEST_VALIDATION_MACRO_F1", "LOWEST_VALIDATION_LOSS", "EARLIEST_EPOCH"], "finalExport": {"sourceCheckpoint": selected_path, "path": "final", "format": "SAFETENSORS", "files": file_records(final_dir)}, "lifecycle": {"startedAt": lifecycle["startedAt"], "endedAt": ended, "elapsedSeconds": duration}, "protectedDataExclusion": {"internalTestRawAccesses": 0, "benchmarkRawAccesses": 0, "reserveUses": 0, "exclusionUses": 0, "onlyAuthorizedTrainValidationUsed": True}, "productionThresholdStatus": "NOT_SELECTED", "trainingRuns": 1, "warnings": ["VALIDATION_HAS_13_ROWS_HIGH_SAMPLING_VARIANCE"]}
        manifest = {**manifest_payload, "runPayloadDigest": payload_digest(manifest_payload)}
        atomic_json(run_dir / "run-manifest.json", manifest)
        lifecycle = {**lifecycle, "status": "COMPLETED", "completedAt": ended, "runManifestSha256": sha_file(run_dir / "run-manifest.json")}
        Path(run_dir / "lifecycle.json").unlink(); atomic_json(run_dir / "lifecycle.json", lifecycle)
        summary = {"status": "FIRST_TRAINING_RUN_COMPLETED", "epochsCompleted": 3, "optimizerSteps": 75, "epochs": epoch_metrics, "retainedCheckpoints": [{"path": item["path"], "sha256": next(file["sha256"] for file in item["files"] if file["filename"] == "model.safetensors")} for item in retained], "selectedCheckpoint": selected_path, "selectedModelSha256": next(item["sha256"] for item in manifest["finalExport"]["files"] if item["filename"] == "model.safetensors"), "runManifestPath": str((run_dir / "run-manifest.json").relative_to(preflight["backend"])).replace("\\", "/"), "runManifestSha256": lifecycle["runManifestSha256"], "elapsedSeconds": duration, "internalTestRawAccesses": 0, "benchmarkRawAccesses": 0, "reserveUses": 0, "exclusionUses": 0, "productionThresholdStatus": "NOT_SELECTED", "warnings": manifest["warnings"]}
        atomic_json(run_dir / "result-summary.json", summary)
        print("FINAL_SELECTED_CHECKPOINT " + selected_path, flush=True)
        print("FIRST_TRAINING_RUN_COMPLETED", flush=True)
        print(canonical(summary), flush=True)
    except KeyboardInterrupt:
        retract_completion_artifacts(run_dir)
        mark_nonterminal(run_dir, lifecycle, "INTERRUPTED", "KeyboardInterrupt", "Local training was interrupted")
        raise
    except Exception as error:
        retract_completion_artifacts(run_dir)
        mark_nonterminal(run_dir, lifecycle, "FAILED", stage, bounded_error(error))
        raise


def bounded_error(error):
    text = str(error).replace("\r", " ").replace("\n", " ")
    return text[:500]


def retract_completion_artifacts(run_dir):
    # These files were created only by this still-incomplete, unique output root.
    # Removing them prevents a late write failure from leaving completed authority.
    for name in ("run-manifest.json", "result-summary.json"):
        path = Path(run_dir) / name
        if path.exists():
            path.unlink()


def mark_nonterminal(run_dir, lifecycle, status, error_type, message):
    failure = {"status": status, "errorType": error_type, "message": message, "failedAt": now(), "completedAuthorityProduced": False}
    atomic_json(run_dir / ("interrupted.json" if status == "INTERRUPTED" else "failure.json"), failure)
    current = Path(run_dir / "lifecycle.json")
    if current.exists(): current.unlink()
    atomic_json(run_dir / "lifecycle.json", {**lifecycle, "status": status, "completedAt": None})


def main():
    parser = argparse.ArgumentParser(description="STHN authority-bound local XLM-R CPU training runner")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--preflight", action="store_true", help="Validate all authorities/environment/resources without loading the model")
    mode.add_argument("--self-test", action="store_true", help="Run synthetic metric/checkpoint tests without ML execution")
    mode.add_argument("--execute-authorized-local-run", action="store_true", help="Execute the one frozen T6L-8C2 CPU run")
    args = parser.parse_args()
    try:
        if args.self_test:
            run_self_test(); return 0
        result = authority_preflight(require_empty_output=True)
        print("AUTHORITY_PREFLIGHT_PASSED", flush=True)
        print(canonical({"status": "PREFLIGHT_PASSED", "trainRows": 200, "validationRows": 13, "epochs": 3, "optimizerSteps": 75, "validationEvaluations": 3, "conceptualCheckpoints": 3, "runtime": result["versions"], "resources": result["resources"], "modelInstantiated": False, "trainingRuns": 0, "forwardPasses": 0, "backwardPasses": 0, "optimizerStepsPerformed": 0, "realCheckpointsCreated": 0, "classifierEvaluations": 0, "writesPerformed": False}), flush=True)
        if args.preflight: return 0
        execute_training(result); return 0
    except KeyboardInterrupt:
        print("INTERRUPTED: local training did not complete", file=sys.stderr, flush=True); return 130
    except Exception as error:
        print(f"{type(error).__name__}: {bounded_error(error)}", file=sys.stderr, flush=True); return 1


if __name__ == "__main__":
    raise SystemExit(main())
