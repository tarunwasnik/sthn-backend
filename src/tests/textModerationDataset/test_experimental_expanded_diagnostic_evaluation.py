"""Mechanical tests for the expanded-data diagnostic runner; never load XLM-R."""
import importlib.util
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
RUNNER_PATH = ROOT / "src/research/textModerationDataset/training/run_experimental_expanded_diagnostic_evaluation.py"
sys.path.insert(0, str(RUNNER_PATH.parent))
SPEC = importlib.util.spec_from_file_location("experimental_diagnostic_runner", RUNNER_PATH)
RUNNER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RUNNER)


class ExperimentalDiagnosticEvaluationTests(unittest.TestCase):
    def setUp(self):
        self.original_csv_rows = RUNNER.csv_rows
        self.original_archive_path = RUNNER.archive_path
        RUNNER.archive_path = lambda _source: Path("synthetic.zip")

    def tearDown(self):
        RUNNER.csv_rows = self.original_csv_rows
        RUNNER.archive_path = self.original_archive_path

    def test_source_label_mappings_and_exclusions(self):
        RUNNER.csv_rows = lambda _archive, _member: iter([
            {"text": "a", "label": "hate"}, {"text": "b", "label": "nothate"},
            {"text": "c", "label": "unknown"}, {"text": "", "label": "hate"},
        ])
        rows, metadata = RUNNER.external_rows("DYNAHATE", "member", "text", "label")
        self.assertEqual([row["target"] for row in rows], [1, 0])
        self.assertEqual(metadata["physicalRows"], 4)
        self.assertEqual(metadata["excluded"], {"missingOrEmptyText": 1, "unmappedLabel": 1})

        RUNNER.csv_rows = lambda _archive, _member: iter([
            {"test_case": "a", "label_gold": "hateful"}, {"test_case": "b", "label_gold": "non-hateful"},
        ])
        hatecheck, _ = RUNNER.external_rows("HATECHECK", "member", "test_case", "label_gold", "English")
        multilingual, _ = RUNNER.external_rows("MULTILINGUAL_HATECHECK", "member", "test_case", "label_gold", "Hindi")
        self.assertEqual([row["target"] for row in hatecheck], [1, 0])
        self.assertEqual([row["target"] for row in multilingual], [1, 0])
        self.assertEqual(multilingual[0]["language"], "Hindi")

    def test_binary_metrics_and_development_category_recall(self):
        metrics = RUNNER.metric_values([0, 0, 1, 1], [0, 1, 0, 1])
        self.assertEqual(metrics["confusionMatrix"], [[1, 1], [1, 1]])
        self.assertEqual(metrics["falsePositives"], 1)
        self.assertEqual(metrics["falseNegatives"], 1)
        self.assertEqual(metrics["predictedCounts"], {"ALLOW": 2, "BLOCK": 2})
        self.assertEqual(metrics["accuracy"], 0.5)
        rows = [{"text": category, "target": 1, "category": category} for category in RUNNER.BLOCK_CATEGORIES]
        result = RUNNER.development_result(rows, [1, 0, 1, 0, 1, 0])
        self.assertEqual(result["blockRecallByCategory"], {
            "ABUSIVE_OR_HARASSING": 1.0, "HATE": 0.0, "PROFANITY": 1.0,
            "SEXUAL": 0.0, "THREAT_OR_VIOLENCE": 1.0, "BINARY_ONLY_BLOCK": 0.0,
        })
        self.assertIsNone(result["auxiliaryCategoryAccuracy"])


if __name__ == "__main__":
    unittest.main()
