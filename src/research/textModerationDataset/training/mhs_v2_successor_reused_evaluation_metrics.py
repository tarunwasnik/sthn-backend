"""Pure protected-data-free metrics and paired-comparison helpers for T6L-8F-C."""
import math


LABELS = ("ALLOW", "BLOCK")
JOIN_KEYS = ("source", "exampleId", "textSha256", "trueTarget")
RESULT_FIELDS = {
    "source", "exampleId", "textSha256", "trueDecision", "trueTarget",
    "predictedDecision", "predictedTarget", "binaryLogits", "allowLogit",
    "blockLogit", "allowScore", "blockScore", "scoreSemantics", "correct",
    "truncated", "metadata",
}
FORBIDDEN_FIELDS = {
    "text", "rawText", "content", "message", "auxiliaryLogits",
    "auxiliaryProbabilities", "auxiliaryScores", "auxiliaryPrediction",
    "embeddings", "hiddenStates", "tokenIds", "attentionTensors", "gradients",
}


def stable_softmax(logits):
    if not isinstance(logits, (list, tuple)) or len(logits) != 2:
        raise ValueError("MALFORMED_TWO_LOGIT_OUTPUT")
    if any(isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) for value in logits):
        raise ValueError("NONFINITE_TWO_LOGIT_OUTPUT")
    maximum = max(logits)
    exponents = [math.exp(float(value) - maximum) for value in logits]
    total = sum(exponents)
    scores = [value / total for value in exponents]
    if total <= 0 or any(not math.isfinite(value) or value < 0 or value > 1 for value in scores) or abs(sum(scores) - 1.0) > 1e-12:
        raise ValueError("INVALID_BINARY_SOFTMAX")
    return scores


def predicted_target(logits):
    stable_softmax(logits)
    return 0 if logits[0] >= logits[1] else 1


def build_result(row, logits, truncated=False):
    scores = stable_softmax(logits)
    predicted = predicted_target(logits)
    result = {
        "source": row["source"], "exampleId": row["exampleId"],
        "textSha256": row["textSha256"], "trueDecision": row["trueDecision"],
        "trueTarget": row["trueTarget"], "predictedDecision": LABELS[predicted],
        "predictedTarget": predicted, "binaryLogits": [float(logits[0]), float(logits[1])],
        "allowLogit": float(logits[0]), "blockLogit": float(logits[1]),
        "allowScore": scores[0], "blockScore": scores[1],
        "scoreSemantics": "UNCALIBRATED_MODEL_SCORE",
        "correct": predicted == row["trueTarget"], "truncated": bool(truncated),
        "metadata": dict(row.get("metadata", {})),
    }
    validate_result(result)
    return result


def validate_result(row):
    if set(row) != RESULT_FIELDS or set(row).intersection(FORBIDDEN_FIELDS):
        raise ValueError("RESULT_SCHEMA_OR_PRIVACY_VIOLATION")
    if row["source"] not in ("INTERNAL_TEST", "EXTERNAL_BENCHMARK", "SYNTHETIC_INTERNAL", "SYNTHETIC_BENCHMARK"):
        raise ValueError("INVALID_RESULT_SOURCE")
    if not isinstance(row["exampleId"], str) or not row["exampleId"] or not isinstance(row["textSha256"], str) or len(row["textSha256"]) != 64:
        raise ValueError("INVALID_RESULT_IDENTITY")
    if row["trueDecision"] not in LABELS or row["trueTarget"] not in (0, 1) or row["trueDecision"] != LABELS[row["trueTarget"]]:
        raise ValueError("INVALID_TRUE_TARGET")
    logits = row["binaryLogits"]
    if logits != [row["allowLogit"], row["blockLogit"]]:
        raise ValueError("BINARY_LOGIT_BINDING_MISMATCH")
    scores = stable_softmax(logits)
    if any(not math.isclose(row[key], value, rel_tol=0.0, abs_tol=1e-12) for key, value in zip(("allowScore", "blockScore"), scores)):
        raise ValueError("BINARY_SCORE_MISMATCH")
    predicted = predicted_target(logits)
    if row["predictedTarget"] != predicted or row["predictedDecision"] != LABELS[predicted] or row["correct"] is not (predicted == row["trueTarget"]):
        raise ValueError("BINARY_DECISION_MISMATCH")
    if row["scoreSemantics"] != "UNCALIBRATED_MODEL_SCORE" or not isinstance(row["truncated"], bool) or not isinstance(row["metadata"], dict):
        raise ValueError("RESULT_SEMANTICS_MISMATCH")


def metric_values(rows):
    if not rows:
        raise ValueError("METRICS_REQUIRE_ROWS")
    matrix = [[0, 0], [0, 0]]
    for row in rows:
        actual, predicted = row["trueTarget"], row["predictedTarget"]
        if actual not in (0, 1) or predicted not in (0, 1):
            raise ValueError("METRICS_REQUIRE_BINARY_TARGETS")
        matrix[actual][predicted] += 1
    values = {}
    for index, name in enumerate(LABELS):
        true_positive = matrix[index][index]
        false_positive = matrix[1 - index][index]
        false_negative = matrix[index][1 - index]
        precision = true_positive / (true_positive + false_positive) if true_positive + false_positive else 0.0
        recall = true_positive / (true_positive + false_negative) if true_positive + false_negative else 0.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        values[name] = (precision, recall, f1)
    count = len(rows)
    return {
        "count": count,
        "groundTruthCounts": {"ALLOW": sum(row["trueTarget"] == 0 for row in rows), "BLOCK": sum(row["trueTarget"] == 1 for row in rows)},
        "predictedCounts": {"ALLOW": sum(row["predictedTarget"] == 0 for row in rows), "BLOCK": sum(row["predictedTarget"] == 1 for row in rows)},
        "confusionMatrix": matrix, "accuracy": (matrix[0][0] + matrix[1][1]) / count,
        "allowPrecision": values["ALLOW"][0], "allowRecall": values["ALLOW"][1], "allowF1": values["ALLOW"][2],
        "blockPrecision": values["BLOCK"][0], "blockRecall": values["BLOCK"][1], "blockF1": values["BLOCK"][2],
        "macroF1": (values["ALLOW"][2] + values["BLOCK"][2]) / 2,
        "balancedAccuracy": (values["ALLOW"][1] + values["BLOCK"][1]) / 2,
        "falsePositives": matrix[0][1], "falseNegatives": matrix[1][0],
    }


def validate_complete_rows(rows, source, expected_ids, expected_count, expected_counts=None):
    if len(rows) != expected_count or len({row.get("exampleId") for row in rows}) != expected_count:
        raise ValueError("SOURCE_DUPLICATE_OR_COUNT_MISMATCH")
    if [row.get("exampleId") for row in rows] != list(expected_ids):
        raise ValueError("SOURCE_MISSING_EXTRA_OR_ORDER_MISMATCH")
    if expected_counts and {name: sum(row.get("trueDecision") == name for row in rows) for name in LABELS} != expected_counts:
        raise ValueError("SOURCE_CLASS_COUNT_MISMATCH")
    for row in rows:
        if row.get("source") != source or row.get("trueDecision") not in LABELS or row.get("trueTarget") not in (0, 1) or row.get("trueDecision") != LABELS[row["trueTarget"]]:
            raise ValueError("SOURCE_TARGET_MISMATCH")
        if not isinstance(row.get("text"), str) or not isinstance(row.get("textSha256"), str):
            raise ValueError("SOURCE_TEXT_BINDING_MISSING")


def paired_join(first_rows, successor_rows):
    def indexed(rows, label):
        result = {}
        for row in rows:
            key = tuple(row.get(name) for name in JOIN_KEYS)
            if None in key or key in result:
                raise ValueError(f"{label}_DUPLICATE_OR_INVALID_JOIN_KEY")
            result[key] = row
        return result
    first, successor = indexed(first_rows, "FIRST"), indexed(successor_rows, "SUCCESSOR")
    if set(first) != set(successor):
        raise ValueError("PAIRED_JOIN_MISSING_EXTRA_DIGEST_OR_TARGET_MISMATCH")
    return [(first[key], successor[key]) for key in sorted(first)]


def paired_transitions(pairs):
    result = {name: 0 for name in ("FIRST_WRONG_SUCCESSOR_CORRECT", "FIRST_CORRECT_SUCCESSOR_WRONG", "BOTH_CORRECT", "BOTH_WRONG")}
    for first, successor in pairs:
        if not first["correct"] and successor["correct"]: result["FIRST_WRONG_SUCCESSOR_CORRECT"] += 1
        elif first["correct"] and not successor["correct"]: result["FIRST_CORRECT_SUCCESSOR_WRONG"] += 1
        elif first["correct"] and successor["correct"]: result["BOTH_CORRECT"] += 1
        else: result["BOTH_WRONG"] += 1
    return result


def delta_metrics(first, successor):
    names = ("accuracy", "allowPrecision", "allowRecall", "allowF1", "blockPrecision", "blockRecall", "blockF1", "macroF1", "balancedAccuracy", "falsePositives", "falseNegatives")
    return {name: successor[name] - first[name] for name in names}


def grouped_comparison(pairs, metadata_key, expected_groups, block_only=False):
    result = {}
    for group in expected_groups:
        selected = [(first, successor) for first, successor in pairs if first.get("metadata", {}).get(metadata_key) == group and (not block_only or first["trueTarget"] == 1)]
        first_rows, successor_rows = [item[0] for item in selected], [item[1] for item in selected]
        first_metrics = metric_values(first_rows) if first_rows else None
        successor_metrics = metric_values(successor_rows) if successor_rows else None
        result[group] = {"total": len(selected), "first": first_metrics, "successor": successor_metrics, "deltas": delta_metrics(first_metrics, successor_metrics) if selected else None, "pairedTransitions": paired_transitions(selected)}
        if block_only and selected:
            first_correct = sum(row["predictedTarget"] == 1 for row in first_rows)
            successor_correct = sum(row["predictedTarget"] == 1 for row in successor_rows)
            delta = successor_correct / len(selected) - first_correct / len(selected)
            result[group].update({"firstCorrectBlockCount": first_correct, "successorCorrectBlockCount": successor_correct, "firstBlockRecall": first_correct / len(selected), "successorBlockRecall": successor_correct / len(selected), "blockRecallDelta": delta, "direction": "IMPROVED" if delta > 0 else "DEGRADED" if delta < 0 else "UNCHANGED"})
    return result


def comparison_bundle(first_rows, successor_rows, source):
    pairs = paired_join(first_rows, successor_rows)
    first_metrics, successor_metrics = metric_values(first_rows), metric_values(successor_rows)
    result = {"source": source, "firstMetrics": first_metrics, "successorMetrics": successor_metrics, "deltas": delta_metrics(first_metrics, successor_metrics), "pairedTransitions": paired_transitions(pairs)}
    if source == "EXTERNAL_BENCHMARK":
        result["category"] = grouped_comparison(pairs, "expectedCategory", ("ABUSIVE_OR_HARASSING", "HATE", "OTHER_INAPPROPRIATE", "PROFANITY", "SEXUAL", "THREAT_OR_VIOLENCE"), True)
        result["difficulty"] = grouped_comparison(pairs, "difficulty", ("ADVERSARIAL", "CONTEXTUAL", "EASY"))
        result["language"] = grouped_comparison(pairs, "language", ("en", "en-hi", "hi", "hi-Latn", "th"))
        result["languageSmallGroupWarning"] = True
    return result
