"""Authority-bound T6L-8E successor CPU runner; preparation never executes training."""
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

from mhs_v2_successor_model import AUXILIARY_WEIGHT, CATEGORY_TO_ID

PHASE = "T6L-8E-D_USER_LOCAL_EXECUTION"
RUN_SCHEMA = "STHN_TEXT_MODERATION_MHS_V2_SUCCESSOR_LOCAL_TRAINING_RUN_V1"
RUN_VERSION = "MHS_V2_XLM_ROBERTA_CATEGORY_AWARE_LOCAL_RUN_V1"
MODEL_ID = "FacebookAI/xlm-roberta-base"
REVISION = "e73636d4f797dec63c3081bb6ed5c7b0bb3f2089"
SEED_STRING = "STHN_T6L_8E_B_MHS_V2_SUCCESSOR_CATEGORY_AWARE_TRAINING_RUN_V1"
SEED = 926509953
BASE_WEIGHT_BYTES = 1115567652
BASE_WEIGHT_SHA = "6fd4797bc397c3b8b55d6bb5740366b57e6a3ce91c04c77f22aafc0c128e6feb"
TOKENIZER_SHA = "a898ea75433890f6610f4e470b8ebeb0c21dce5c8dd61f892eb09eb5919d2e2c"
TOKENIZER_BINDING_SHA = "14e87b41020fe70b01b1dfcf4c3250bd2e4f0b49caeaa7c5f8bdc1376f00d654"
EXPECTED = {
    "strategy": "e693587aad615eb4a210503513a6d5b93d8e6be468ab64c2bcfa620e6b451a1e",
    "contract": "80f8f7b65899ec4cf52dbee269dacaced0c3483cbc057daa47d07694e2dab591",
    "environment": "3db1643fe6d65b1b0725751dde56088a70317ae9ae60bc83b5c7a880af85a9d8",
    "training_ready": "62d6139891fb56b2c6d0c2c18f63aa7e20000ef02fbd33e3bf9308a5ee90f6c1",
    "train": "fa9eaeb3fa519ded246bffda1fb57902ca2fcae4c64fb10968d430fab4a4bf74",
    "validation": "5c01425c9c7e6e1f4348e38a98eaf1740898c3ba98f2bb6114d77175631b0d29",
    "projection": "1d2e92c67660998ea5149abd7c572170f5bc4fb1594cfc3276b412d3caa02e18",
}
PAYLOADS = {
    "strategy": "c2a4ca5b41587b2f73cf57f1694bb5e2176d0b5466102d882dd510ada157b9f3",
    "contract": "b3fdddf017c33b2c4af093ed62c4c4b2afc520f2fdb6953a745c9ff4f1bcd5b3",
    "train": "f2c0e863db5169bf3989b3cdf72e2e71efdb71da982540bbfdebd8dc560f03ff",
    "validation": "a1c46eff57f8ee501440fa92eb86f990d8a8648d425a771fd48bbe72447be095",
    "projection": "80d8889daff1eb6e0e965e45b7bcffeb8b65388bd516acca2a0cd9863c89767d",
}
TRAIN_MEMBERSHIP = "6bc66f7d0fdb28d7213c84a0c0dc3be6f607f6c6dc7400ac8e3e84497bdbad61"
VALIDATION_MEMBERSHIP = "2c3e7cc4372c266e3bab8d42a092c74807351c09563f38f46ba0da8fd8eb8164"
VERSIONS = {"python": "3.12.10", "pytorch": "2.3.1+cpu", "transformers": "4.42.4", "accelerate": "0.31.0", "tokenizers": "0.19.1", "sentencepiece": "0.2.0", "safetensors": "0.4.3", "numpy": "1.26.4"}
PACKAGE_NAMES = {"pytorch": "torch", "transformers": "transformers", "accelerate": "accelerate", "tokenizers": "tokenizers", "sentencepiece": "sentencepiece", "safetensors": "safetensors", "numpy": "numpy"}
CATEGORY_COUNTS = {
    "TRAIN": {"ABUSIVE_OR_HARASSING": 18, "HATE": 16, "PROFANITY": 23, "SEXUAL": 18, "THREAT_OR_VIOLENCE": 15},
    "VALIDATION": {"ABUSIVE_OR_HARASSING": 0, "HATE": 1, "PROFANITY": 1, "SEXUAL": 1, "THREAT_OR_VIOLENCE": 1},
}


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
        "allowPrecision": per_class["ALLOW"]["precision"], "allowRecall": per_class["ALLOW"]["recall"], "allowF1": per_class["ALLOW"]["f1"],
        "blockPrecision": per_class["BLOCK"]["precision"], "blockRecall": per_class["BLOCK"]["recall"], "blockF1": per_class["BLOCK"]["f1"],
        "macroF1": (per_class["ALLOW"]["f1"] + per_class["BLOCK"]["f1"]) / 2,
        "balancedAccuracy": (per_class["ALLOW"]["recall"] + per_class["BLOCK"]["recall"]) / 2,
        "perClass": per_class,
    }


def select_checkpoint(epochs):
    if len(epochs) != 3:
        raise ValueError("exactly three epoch metrics are required")
    return sorted(epochs, key=lambda row: (-row["macroF1"], row["binaryValidationLoss"], row["epoch"]))[0]


def repository_paths():
    backend = Path(__file__).resolve().parents[4]
    mhs = backend / "dataset-research/text-moderation/MEASURING_HATE_SPEECH"
    training, materialized, development = mhs / "training", mhs / "materialized", mhs / "development"
    cache = backend / f"evaluation-cache/text-moderation/classifier/facebookai-xlm-roberta-base/{REVISION}"
    output = backend / "evaluation-cache/text-moderation/classifier-training/mhs-v2-xlm-roberta-category-aware-run-v1"
    first_output = backend / "evaluation-cache/text-moderation/classifier-training/mhs-v2-xlm-roberta-first-run-v1"
    return backend, cache, output, {
        "strategy": training / "mhs-v2-successor-training-strategy-analysis-v1.json",
        "contract": training / "mhs-v2-successor-training-contract-v1.json",
        "environment": training / "mhs-v2-training-environment-authority-v1.json",
        "training_ready": materialized / "mhs-training-ready-certification-v2.json",
        "train": materialized / "mhs-train-v2.jsonl", "validation": materialized / "mhs-validation-v2.jsonl",
        "projection": development / "mhs-development-text-projection-v2.jsonl",
        "tokenizer_binding": first_output / "final/tokenizer-binding.json",
    }


def installed_versions():
    versions = {"python": platform.python_version()}
    for key, package in PACKAGE_NAMES.items():
        versions[key] = importlib.metadata.version(package)
    return versions


def resource_diagnostics(output, memory=None, disk=None):
    import psutil
    memory = memory or psutil.virtual_memory()
    disk = disk or shutil.disk_usage(output.parent if output.parent.exists() else output.parents[1])
    return {"logicalProcessors": psutil.cpu_count(logical=True), "physicalCores": psutil.cpu_count(logical=False), "totalRamBytes": memory.total, "availableRamBytes": memory.available, "freeDiskBytes": disk.free, "authoritativeForEligibility": False}


def validate_contract(strategy, contract):
    if strategy.get("status") != "SUCCESSOR_STRATEGY_ANALYSIS_COMPLETE" or strategy.get("selectedStrategy") != "BINARY_PLUS_MASKED_AUXILIARY_CATEGORY_NATURAL_SAMPLING":
        raise RuntimeError("AUTHORITY_PREFLIGHT_FAILURE: strategy authority mismatch")
    if strategy.get("strategyPayloadDigest") != PAYLOADS["strategy"]:
        raise RuntimeError("AUTHORITY_PREFLIGHT_FAILURE: strategy payload mismatch")
    if contract.get("status") != "SUCCESSOR_TRAINING_CONTRACT_READY" or contract.get("contractPayloadDigest") != PAYLOADS["contract"]:
        raise RuntimeError("AUTHORITY_PREFLIGHT_FAILURE: successor contract mismatch")
    if contract.get("objectives", {}).get("primary", {}).get("label2id") != {"ALLOW": 0, "BLOCK": 1} or contract.get("objectives", {}).get("auxiliary", {}).get("category2id") != CATEGORY_TO_ID:
        raise RuntimeError("AUTHORITY_PREFLIGHT_FAILURE: label mapping mismatch")
    if contract["objectives"]["auxiliary"].get("weight") != AUXILIARY_WEIGHT or contract.get("sampling", {}).get("policy") != "NATURAL_SEEDED_RANDOM_WITHOUT_REPLACEMENT":
        raise RuntimeError("AUTHORITY_PREFLIGHT_FAILURE: objective or sampling mismatch")
    if contract.get("runtime") != {"device": "CPU_REQUIRED", "gpuAuthorized": False, "ramEligibilityGate": "NONE", "resourceDiagnosticsMayBeInformational": True}:
        raise RuntimeError("AUTHORITY_PREFLIGHT_FAILURE: runtime policy mismatch")
    optimization = contract.get("optimization", {})
    required = {"optimizer": "ADAMW_TORCH", "learningRate": 2e-5, "betas": [0.9, 0.999], "epsilon": 1e-8, "weightDecay": 0.01, "trainPhysicalBatchSize": 8, "validationBatchSize": 8, "gradientAccumulationSteps": 1, "effectiveBatchSize": 8, "epochs": 3, "scheduler": "LINEAR_DECAY", "warmupSteps": 2, "maxGradientNorm": 1, "totalOptimizerSteps": 75, "precision": "FP32"}
    if any(optimization.get(key) != value for key, value in required.items()):
        raise RuntimeError("AUTHORITY_PREFLIGHT_FAILURE: optimization mismatch")
    if contract.get("reproducibility", {}).get("seedString") != SEED_STRING or contract["reproducibility"].get("seedInteger") != SEED:
        raise RuntimeError("AUTHORITY_PREFLIGHT_FAILURE: seed mismatch")


def validate_and_join(train, validation, projection):
    if len(projection) != 213 or len({row.get("exampleId") for row in projection}) != 213:
        raise RuntimeError("AUTHORITY_PREFLIGHT_FAILURE: projection membership mismatch")
    index = {row["exampleId"]: row for row in projection}
    joined = {}
    for split, rows, expected, allow, block in (("TRAIN", train, 200, 110, 90), ("VALIDATION", validation, 13, 9, 4)):
        if len(rows) != expected or len({row.get("exampleId") for row in rows}) != expected:
            raise RuntimeError(f"AUTHORITY_PREFLIGHT_FAILURE: {split} count mismatch")
        if sum(row.get("decision") == "ALLOW" for row in rows) != allow or sum(row.get("decision") == "BLOCK" for row in rows) != block:
            raise RuntimeError(f"AUTHORITY_PREFLIGHT_FAILURE: {split} decision mismatch")
        counts = {name: 0 for name in CATEGORY_TO_ID}
        prepared = []
        for row in rows:
            authority = index.get(row.get("exampleId"))
            corroboration = ("candidateTextDigest", "decision", "primaryCategory", "split", "origin")
            if authority is None or any(row.get(key) != authority.get(key) for key in corroboration):
                raise RuntimeError(f"AUTHORITY_PREFLIGHT_FAILURE: {split} category-authority join mismatch")
            if hashlib.sha256(row.get("text", "").encode("utf-8")).hexdigest() != row.get("candidateTextDigest"):
                raise RuntimeError(f"AUTHORITY_PREFLIGHT_FAILURE: {split} text digest mismatch")
            target = 0 if row.get("decision") == "ALLOW" else 1 if row.get("decision") == "BLOCK" else None
            if row.get("target") != target or row.get("split") != split:
                raise RuntimeError(f"AUTHORITY_PREFLIGHT_FAILURE: {split} target binding mismatch")
            category = row.get("primaryCategory")
            if target == 1:
                if category not in CATEGORY_TO_ID:
                    raise RuntimeError(f"AUTHORITY_PREFLIGHT_FAILURE: unsupported BLOCK category in {split}")
                counts[category] += 1
                auxiliary_target, auxiliary_mask = CATEGORY_TO_ID[category], 1
            else:
                if category is not None:
                    raise RuntimeError(f"AUTHORITY_PREFLIGHT_FAILURE: ALLOW category must be absent in {split}")
                auxiliary_target, auxiliary_mask = 0, 0
            prepared.append({**row, "auxiliaryTarget": auxiliary_target, "auxiliaryMask": auxiliary_mask})
        if counts != CATEGORY_COUNTS[split]:
            raise RuntimeError(f"AUTHORITY_PREFLIGHT_FAILURE: {split} category distribution mismatch")
        joined[split.lower()] = prepared
    if set(index) != {row["exampleId"] for row in train + validation}:
        raise RuntimeError("AUTHORITY_PREFLIGHT_FAILURE: development join is not exact")
    return joined


def authority_preflight(require_empty_output=True, memory=None, disk=None):
    backend, cache, output, paths = repository_paths()
    expected_output = (backend / "evaluation-cache/text-moderation/classifier-training/mhs-v2-xlm-roberta-category-aware-run-v1").resolve()
    if output.resolve() != expected_output or output.is_symlink():
        raise RuntimeError("AUTHORITY_PREFLIGHT_FAILURE: unauthorized output root")
    if require_empty_output and output.exists():
        raise RuntimeError("AUTHORITY_PREFLIGHT_FAILURE: output root already exists; overwrite and resume are prohibited")
    for name in ("strategy", "contract", "environment", "training_ready", "train", "validation", "projection"):
        if not paths[name].is_file() or sha_file(paths[name]) != EXPECTED[name]:
            raise RuntimeError(f"AUTHORITY_PREFLIGHT_FAILURE: {name} SHA mismatch")
    if not paths["tokenizer_binding"].is_file() or sha_file(paths["tokenizer_binding"]) != TOKENIZER_BINDING_SHA:
        raise RuntimeError("AUTHORITY_PREFLIGHT_FAILURE: tokenizer binding mismatch")
    strategy, contract = load_json(paths["strategy"]), load_json(paths["contract"])
    validate_contract(strategy, contract)
    versions = installed_versions()
    if versions != VERSIONS:
        raise RuntimeError(f"DEPENDENCY_RUNTIME_FAILURE: exact environment required; observed {versions}")
    weight, tokenizer = cache / "model.safetensors", cache / "tokenizer.json"
    if not weight.is_file() or weight.stat().st_size != BASE_WEIGHT_BYTES or sha_file(weight) != BASE_WEIGHT_SHA:
        raise RuntimeError("AUTHORITY_PREFLIGHT_FAILURE: base model identity mismatch")
    if not tokenizer.is_file() or sha_file(tokenizer) != TOKENIZER_SHA:
        raise RuntimeError("AUTHORITY_PREFLIGHT_FAILURE: tokenizer identity mismatch")
    joined = validate_and_join(load_jsonl(paths["train"]), load_jsonl(paths["validation"]), load_jsonl(paths["projection"]))
    return {"backend": backend, "cache": cache, "output": output, "paths": paths, "contract": contract, "train": joined["train"], "validation": joined["validation"], "versions": versions, "resources": resource_diagnostics(output, memory, disk)}


def file_records(root):
    return [{"filename": str(item.relative_to(root)).replace("\\", "/"), "byteSize": item.stat().st_size, "sha256": sha_file(item)} for item in sorted(root.rglob("*")) if item.is_file()]


def run_self_test():
    import torch
    from mhs_v2_successor_model import compute_multitask_objective
    binary = torch.tensor([[2.0, -1.0], [-1.0, 2.0]], requires_grad=True)
    auxiliary = torch.tensor([[1.0, 0.0, 0.0, 0.0, 0.0], [0.0, 1.0, 0.0, 0.0, 0.0]], requires_grad=True)
    labels, auxiliary_labels = torch.tensor([0, 1]), torch.tensor([0, 1])
    zero = compute_multitask_objective(binary, auxiliary, labels, auxiliary_labels, torch.tensor([0, 0]))
    mixed = compute_multitask_objective(binary, auxiliary, labels, auxiliary_labels, torch.tensor([0, 1]))
    mixed.loss.backward()
    tie = select_checkpoint([{"epoch": 1, "macroF1": .5, "binaryValidationLoss": .4}, {"epoch": 2, "macroF1": .5, "binaryValidationLoss": .3}, {"epoch": 3, "macroF1": .5, "binaryValidationLoss": .3}])
    if zero.auxiliary_eligible_count != 0 or float(zero.auxiliary_loss) != 0 or mixed.auxiliary_eligible_count != 1 or not torch.isfinite(mixed.loss) or auxiliary.grad is None or tie["epoch"] != 2:
        raise RuntimeError("SELF_TEST_FAILURE")
    print(canonical({"status": "SELF_TEST_PASSED", "modelLoads": 0, "forwardPasses": 0, "trainingRuns": 0, "protectedInference": 0, "thresholdSelections": 0}))


def execute_training(preflight):
    # Reachable only through the explicit future user command.
    import numpy as np
    import psutil
    import torch
    from torch.utils.data import Dataset
    from transformers import AutoConfig, AutoTokenizer, Trainer, TrainerCallback, TrainingArguments, set_seed
    from mhs_v2_successor_model import build_successor_model_class

    if torch.cuda.is_available() or os.environ.get("CUDA_VISIBLE_DEVICES") != "":
        raise RuntimeError("DEPENDENCY_RUNTIME_FAILURE: GPU execution is prohibited")
    output, cache = preflight["output"], preflight["cache"]
    output.mkdir(parents=True, exist_ok=False)
    run_dir, checkpoints, final_dir = output / "run", output / "checkpoints", output / "final"
    run_dir.mkdir(); checkpoints.mkdir(); final_dir.mkdir()
    lifecycle = {"phase": PHASE, "status": "RUNNING", "startedAt": now(), "completedAt": None, "successorTrainingContractSha256": EXPECTED["contract"]}
    atomic_json(run_dir / "lifecycle.json", lifecycle)
    started, stage = time.monotonic(), "TRAINING_RUNTIME_FAILURE"

    class Rows(Dataset):
        def __init__(self, rows): self.rows = rows
        def __len__(self): return len(self.rows)
        def __getitem__(self, index):
            row = self.rows[index]
            return {"text": row["text"], "label": row["target"], "auxiliary_label": row["auxiliaryTarget"], "auxiliary_mask": row["auxiliaryMask"]}

    class Collator:
        def __init__(self, tokenizer): self.tokenizer = tokenizer
        def __call__(self, features):
            batch = self.tokenizer([row["text"] for row in features], padding="longest", truncation=True, max_length=160, add_special_tokens=True, return_attention_mask=True, return_token_type_ids=False, return_tensors="pt")
            batch["labels"] = torch.tensor([row["label"] for row in features], dtype=torch.int64)
            batch["auxiliary_labels"] = torch.tensor([row["auxiliary_label"] for row in features], dtype=torch.int64)
            batch["auxiliary_mask"] = torch.tensor([row["auxiliary_mask"] for row in features], dtype=torch.bool)
            return batch

    class Progress(TrainerCallback):
        def on_epoch_begin(self, args, state, control, **kwargs): print(f"EPOCH_START {int(state.epoch or 0)+1}/3", flush=True)
        def on_step_end(self, args, state, control, **kwargs): print(f"TRAINING_PROGRESS {state.global_step}/75", flush=True)
        def on_evaluate(self, args, state, control, metrics=None, **kwargs): print("VALIDATION_COMPLETE " + json.dumps(metrics or {}, sort_keys=True), flush=True)

    class TieBreak(TrainerCallback):
        def __init__(self): self.best = None
        def on_evaluate(self, args, state, control, metrics=None, **kwargs):
            if not metrics: return control
            current = (float(metrics["eval_macro_f1"]), float(metrics["eval_loss"]), int(round(state.epoch)))
            if self.best is not None and current[0] == self.best[0] and current[1] < self.best[1] and state.best_metric is not None: state.best_metric = current[0] - 1e-12
            if self.best is None or (-current[0], current[1], current[2]) < (-self.best[0], self.best[1], self.best[2]): self.best = current
            return control

    def trainer_metrics(prediction):
        labels = np.asarray(prediction.label_ids, dtype=np.int64)
        predicted = np.argmax(prediction.predictions, axis=1)
        metrics = metric_values(labels.tolist(), predicted.tolist())
        return {"accuracy": metrics["accuracy"], "allow_precision": metrics["allowPrecision"], "allow_recall": metrics["allowRecall"], "allow_f1": metrics["allowF1"], "block_precision": metrics["blockPrecision"], "block_recall": metrics["blockRecall"], "block_f1": metrics["blockF1"], "macro_f1": metrics["macroF1"], "balanced_accuracy": metrics["balancedAccuracy"], "cm_allow_allow": metrics["confusionMatrix"][0][0], "cm_allow_block": metrics["confusionMatrix"][0][1], "cm_block_allow": metrics["confusionMatrix"][1][0], "cm_block_block": metrics["confusionMatrix"][1][1]}

    try:
        random.seed(SEED); np.random.seed(SEED); torch.manual_seed(SEED); set_seed(SEED)
        torch.use_deterministic_algorithms(True, warn_only=False); torch.backends.cudnn.deterministic = True; torch.backends.cudnn.benchmark = False; torch.backends.cuda.matmul.allow_tf32 = False
        tokenizer = AutoTokenizer.from_pretrained(cache, local_files_only=True, use_fast=True)
        config = AutoConfig.from_pretrained(cache, local_files_only=True, num_labels=2, label2id={"ALLOW": 0, "BLOCK": 1}, id2label={0: "ALLOW", 1: "BLOCK"}, hidden_dropout_prob=.1, attention_probs_dropout_prob=.1, classifier_dropout=.1)
        Model = build_successor_model_class()
        model = Model.from_pretrained(cache, config=config, local_files_only=True, use_safetensors=True).reset_task_heads(SEED)
        if next(model.parameters()).device.type != "cpu": raise RuntimeError("MODEL_LOADING_FAILURE: CPU model required")
        arguments = TrainingArguments(output_dir=str(checkpoints), overwrite_output_dir=False, num_train_epochs=3, per_device_train_batch_size=8, per_device_eval_batch_size=8, gradient_accumulation_steps=1, learning_rate=2e-5, weight_decay=.01, adam_beta1=.9, adam_beta2=.999, adam_epsilon=1e-8, max_grad_norm=1.0, lr_scheduler_type="linear", warmup_steps=2, evaluation_strategy="epoch", save_strategy="epoch", logging_strategy="epoch", save_total_limit=2, load_best_model_at_end=True, metric_for_best_model="macro_f1", greater_is_better=True, seed=SEED, data_seed=SEED, dataloader_num_workers=0, use_cpu=True, fp16=False, bf16=False, tf32=False, full_determinism=True, remove_unused_columns=False, label_names=["labels"], report_to=[], optim="adamw_torch", save_safetensors=True)
        trainer = Trainer(model=model, args=arguments, train_dataset=Rows(preflight["train"]), eval_dataset=Rows(preflight["validation"]), data_collator=Collator(tokenizer), compute_metrics=trainer_metrics, callbacks=[Progress(), TieBreak()])
        trainer.train()
        if trainer.state.global_step != 75: raise RuntimeError("TRAINING_RUNTIME_FAILURE: optimizer-step accounting mismatch")
        epoch_metrics, training_losses = [], []
        for row in trainer.state.log_history:
            if "loss" in row and "eval_loss" not in row: training_losses.append({"epoch": int(round(row["epoch"])), "combinedLoss": float(row["loss"])})
            if "eval_macro_f1" in row:
                epoch = int(round(row["epoch"])); epoch_metrics.append({"epoch": epoch, "globalStep": int(row["step"]), "combinedTrainingLoss": next((x["combinedLoss"] for x in training_losses if x["epoch"] == epoch), None), "binaryValidationLoss": float(row["eval_loss"]), "confusionMatrix": [[int(row["eval_cm_allow_allow"]), int(row["eval_cm_allow_block"])], [int(row["eval_cm_block_allow"]), int(row["eval_cm_block_block"])]], "accuracy": float(row["eval_accuracy"]), "allowPrecision": float(row["eval_allow_precision"]), "allowRecall": float(row["eval_allow_recall"]), "allowF1": float(row["eval_allow_f1"]), "blockPrecision": float(row["eval_block_precision"]), "blockRecall": float(row["eval_block_recall"]), "blockF1": float(row["eval_block_f1"]), "macroF1": float(row["eval_macro_f1"]), "balancedAccuracy": float(row["eval_balanced_accuracy"])})
        if len(epoch_metrics) != 3 or [row["globalStep"] for row in epoch_metrics] != [25, 50, 75]: raise RuntimeError("VALIDATION_FAILURE: evaluation accounting mismatch")
        if any(value is None or not math.isfinite(value) for row in epoch_metrics for value in (row["combinedTrainingLoss"], row["binaryValidationLoss"], row["macroF1"])): raise RuntimeError("NAN_INF_FAILURE")
        selected = select_checkpoint(epoch_metrics); selected_original = checkpoints / f"checkpoint-{selected['globalStep']}"
        if not selected_original.is_dir() or not trainer.state.best_model_checkpoint or Path(trainer.state.best_model_checkpoint).resolve() != selected_original.resolve(): raise RuntimeError("CHECKPOINT_WRITE_FAILURE: selected checkpoint mismatch")
        trainer.model.save_pretrained(final_dir, safe_serialization=True)
        atomic_json(final_dir / "tokenizer-binding.json", {"repository": MODEL_ID, "revision": REVISION, "tokenizerArtifactSha256": TOKENIZER_SHA, "successorTrainingContractSha256": EXPECTED["contract"]})
        retained = []
        for directory in sorted(checkpoints.glob("checkpoint-*"), key=lambda item: int(item.name.split("-")[-1])):
            step = int(directory.name.split("-")[-1]); epoch = step // 25; target = checkpoints / f"checkpoint-epoch-{epoch:02d}"; directory.rename(target)
            retained.append({"epoch": epoch, "globalStep": step, "path": str(target.relative_to(output)).replace("\\", "/"), "files": file_records(target)})
        selected_path = f"checkpoints/checkpoint-epoch-{selected['epoch']:02d}"
        if sha_file(output / selected_path / "model.safetensors") != sha_file(final_dir / "model.safetensors"): raise RuntimeError("CHECKPOINT_WRITE_FAILURE: final export differs from selected checkpoint")
        ended, duration = now(), time.monotonic() - started
        manifest_payload = {"schemaVersion": RUN_SCHEMA, "runVersion": RUN_VERSION, "phase": PHASE, "runId": "mhs-v2-xlm-roberta-category-aware-run-v1", "terminalStatus": "COMPLETED", "principalExperimentalVariable": "ADD_MASKED_AUXILIARY_BLOCK_CATEGORY_CROSS_ENTROPY", "authorities": {"strategySha256": EXPECTED["strategy"], "strategyPayloadDigest": PAYLOADS["strategy"], "successorTrainingContractSha256": EXPECTED["contract"], "successorTrainingContractPayloadDigest": PAYLOADS["contract"], "trainSha256": EXPECTED["train"], "trainPayloadDigest": PAYLOADS["train"], "trainMembershipDigest": TRAIN_MEMBERSHIP, "validationSha256": EXPECTED["validation"], "validationPayloadDigest": PAYLOADS["validation"], "validationMembershipDigest": VALIDATION_MEMBERSHIP, "developmentProjectionSha256": EXPECTED["projection"], "developmentProjectionPayloadDigest": PAYLOADS["projection"]}, "baseModel": {"repository": MODEL_ID, "revision": REVISION, "weightSha256": BASE_WEIGHT_SHA, "tokenizerSha256": TOKENIZER_SHA, "source": "ORIGINAL_PINNED_BASE"}, "model": {"binaryHeadLabels": 2, "auxiliaryHeadLabels": 5, "category2id": CATEGORY_TO_ID, "auxiliaryWeight": AUXILIARY_WEIGHT}, "toolchain": preflight["versions"], "hardware": {"device": "cpu", "cudaAvailable": False, "cpu": platform.processor() or os.environ.get("PROCESSOR_IDENTIFIER", "unknown"), "resourceDiagnostics": {**preflight["resources"], "authoritativeForEligibility": False}}, "seed": {"string": SEED_STRING, "integer": SEED}, "configuration": {"maxLength": 160, "trainBatchSize": 8, "validationBatchSize": 8, "gradientAccumulation": 1, "effectiveBatchSize": 8, "optimizer": "AdamW", "learningRate": 2e-5, "betas": [.9, .999], "epsilon": 1e-8, "weightDecay": .01, "sampling": "NATURAL_SEEDED_RANDOM_WITHOUT_REPLACEMENT", "scheduler": "linear", "warmupSteps": 2, "epochs": 3, "maxGradNorm": 1.0, "precision": "FP32", "decisionRule": "ARGMAX_BINARY_LOGITS"}, "steps": {"batchesPerEpoch": 25, "totalOptimizerSteps": 75, "schedulerSteps": 75, "validationEvaluations": 3}, "epochs": epoch_metrics, "retainedCheckpoints": retained, "selectedCheckpoint": {**selected, "path": selected_path}, "selectionRule": ["HIGHEST_VALIDATION_BINARY_MACRO_F1", "LOWEST_VALIDATION_BINARY_LOSS", "EARLIEST_EPOCH"], "auxiliaryMetricsAuthority": "DIAGNOSTIC_ONLY", "finalExport": {"sourceCheckpoint": selected_path, "path": "final", "format": "SAFETENSORS", "files": file_records(final_dir)}, "lifecycle": {"startedAt": lifecycle["startedAt"], "endedAt": ended, "elapsedSeconds": duration}, "boundaries": {"protectedRawTextAccesses": 0, "protectedInference": 0, "reserveUses": 0, "exclusionUses": 0, "thresholdSelections": 0}, "productionThresholdStatus": "NOT_SELECTED", "trainingRuns": 1, "warnings": ["VALIDATION_HAS_13_ROWS_HIGH_SAMPLING_VARIANCE"]}
        manifest = {**manifest_payload, "runPayloadDigest": payload_digest(manifest_payload)}; atomic_json(run_dir / "run-manifest.json", manifest)
        lifecycle = {**lifecycle, "status": "COMPLETED", "completedAt": ended, "runManifestSha256": sha_file(run_dir / "run-manifest.json")}; (run_dir / "lifecycle.json").unlink(); atomic_json(run_dir / "lifecycle.json", lifecycle)
        atomic_json(run_dir / "result-summary.json", {"status": "SUCCESSOR_TRAINING_RUN_COMPLETED", "epochsCompleted": 3, "optimizerSteps": 75, "selectedCheckpoint": selected_path, "selectedModelSha256": sha_file(final_dir / "model.safetensors"), "runManifestSha256": lifecycle["runManifestSha256"], "productionThresholdStatus": "NOT_SELECTED", "warnings": manifest["warnings"]})
        print("SUCCESSOR_TRAINING_RUN_COMPLETED", flush=True)
    except KeyboardInterrupt:
        retract_completion_artifacts(run_dir); mark_nonterminal(run_dir, lifecycle, "INTERRUPTED", "KeyboardInterrupt", "Local training was interrupted"); raise
    except Exception as error:
        retract_completion_artifacts(run_dir); mark_nonterminal(run_dir, lifecycle, "FAILED", stage, bounded_error(error)); raise


def bounded_error(error):
    return str(error).replace("\r", " ").replace("\n", " ")[:500]


def retract_completion_artifacts(run_dir):
    for name in ("run-manifest.json", "result-summary.json"):
        target = Path(run_dir) / name
        if target.exists(): target.unlink()


def mark_nonterminal(run_dir, lifecycle, status, error_type, message):
    atomic_json(Path(run_dir) / ("interrupted.json" if status == "INTERRUPTED" else "failure.json"), {"status": status, "errorType": error_type, "message": message, "failedAt": now(), "completedAuthorityProduced": False})
    current = Path(run_dir) / "lifecycle.json"
    if current.exists(): current.unlink()
    atomic_json(current, {**lifecycle, "status": status, "completedAt": None})


def main():
    parser = argparse.ArgumentParser(description="STHN authority-bound successor local XLM-R CPU training runner")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--preflight", action="store_true")
    mode.add_argument("--self-test", action="store_true")
    mode.add_argument("--execute-authorized-local-run", action="store_true")
    args = parser.parse_args()
    try:
        if args.self_test: run_self_test(); return 0
        result = authority_preflight(require_empty_output=True)
        print("AUTHORITY_PREFLIGHT_PASSED", flush=True)
        print(canonical({"status": "PREFLIGHT_PASSED", "trainRows": 200, "validationRows": 13, "categoryJoinRows": 213, "optimizerSteps": 75, "resources": result["resources"], "modelLoads": 0, "forwardPasses": 0, "trainingRuns": 0, "protectedInference": 0, "thresholdSelections": 0, "writesPerformed": False}), flush=True)
        if args.preflight: return 0
        execute_training(result); return 0
    except KeyboardInterrupt:
        print("INTERRUPTED: local training did not complete", file=sys.stderr, flush=True); return 130
    except Exception as error:
        print(f"{type(error).__name__}: {bounded_error(error)}", file=sys.stderr, flush=True); return 1


if __name__ == "__main__":
    raise SystemExit(main())
