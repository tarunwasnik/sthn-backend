import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

RUNNER = Path(__file__).resolve().parents[2] / "research/textModerationDataset/training/run_mhs_v2_local_training.py"
SPEC = importlib.util.spec_from_file_location("mhs_v2_local_runner", RUNNER)
runner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runner)


class LocalTrainingPreparationTests(unittest.TestCase):
    def test_perfect_confusion_matrix(self):
        self.assertEqual(runner.metric_values([0, 0, 1, 1], [0, 0, 1, 1])["confusionMatrix"], [[2, 0], [0, 2]])

    def test_accuracy(self):
        self.assertEqual(runner.metric_values([0, 0, 1, 1], [0, 1, 1, 0])["accuracy"], 0.5)

    def test_block_precision(self):
        self.assertEqual(runner.metric_values([0, 0, 1, 1], [0, 1, 1, 1])["blockPrecision"], 2 / 3)

    def test_block_recall(self):
        self.assertEqual(runner.metric_values([0, 0, 1, 1], [0, 1, 1, 0])["blockRecall"], 0.5)

    def test_block_f1(self):
        self.assertEqual(runner.metric_values([0, 0, 1, 1], [0, 1, 1, 1])["blockF1"], 0.8)

    def test_macro_f1(self):
        self.assertEqual(runner.metric_values([0, 0, 1, 1], [0, 0, 1, 1])["macroF1"], 1)

    def test_balanced_accuracy(self):
        self.assertEqual(runner.metric_values([0, 0, 1, 1], [0, 0, 0, 0])["balancedAccuracy"], 0.5)

    def test_zero_denominator_is_zero(self):
        result = runner.metric_values([0, 0, 1, 1], [0, 0, 0, 0])
        self.assertEqual((result["blockPrecision"], result["blockRecall"], result["blockF1"]), (0, 0, 0))

    def test_invalid_metric_input_rejected(self):
        with self.assertRaises(ValueError): runner.metric_values([0], [2])

    def test_higher_macro_f1_selected(self):
        rows = [{"epoch": 1, "macroF1": 0.4, "validationLoss": 0.1}, {"epoch": 2, "macroF1": 0.6, "validationLoss": 0.8}, {"epoch": 3, "macroF1": 0.5, "validationLoss": 0.2}]
        self.assertEqual(runner.select_checkpoint(rows)["epoch"], 2)

    def test_lower_loss_tie_break(self):
        rows = [{"epoch": 1, "macroF1": 0.5, "validationLoss": 0.4}, {"epoch": 2, "macroF1": 0.5, "validationLoss": 0.3}, {"epoch": 3, "macroF1": 0.4, "validationLoss": 0.1}]
        self.assertEqual(runner.select_checkpoint(rows)["epoch"], 2)

    def test_earlier_epoch_final_tie_break(self):
        rows = [{"epoch": 1, "macroF1": 0.5, "validationLoss": 0.3}, {"epoch": 2, "macroF1": 0.5, "validationLoss": 0.3}, {"epoch": 3, "macroF1": 0.4, "validationLoss": 0.1}]
        self.assertEqual(runner.select_checkpoint(rows)["epoch"], 1)

    def test_wrong_checkpoint_count_rejected(self):
        with self.assertRaises(ValueError): runner.select_checkpoint([])

    def test_atomic_writer_refuses_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "artifact.json"
            runner.atomic_json(target, {"status": "FIRST"})
            with self.assertRaises(RuntimeError): runner.atomic_json(target, {"status": "SECOND"})
            self.assertEqual(json.loads(target.read_text()), {"status": "FIRST"})

    def test_interrupted_lifecycle_never_completed(self):
        with tempfile.TemporaryDirectory() as directory:
            run_dir = Path(directory)
            runner.atomic_json(run_dir / "lifecycle.json", {"status": "RUNNING"})
            runner.mark_nonterminal(run_dir, {"status": "RUNNING", "completedAt": None}, "INTERRUPTED", "KeyboardInterrupt", "interrupted")
            lifecycle = json.loads((run_dir / "lifecycle.json").read_text())
            interruption = json.loads((run_dir / "interrupted.json").read_text())
            self.assertEqual(lifecycle["status"], "INTERRUPTED")
            self.assertFalse(interruption["completedAuthorityProduced"])
            self.assertFalse((run_dir / "run-manifest.json").exists())

    def test_late_failure_retracts_completion_artifacts(self):
        with tempfile.TemporaryDirectory() as directory:
            run_dir = Path(directory)
            runner.atomic_json(run_dir / "run-manifest.json", {"terminalStatus": "COMPLETED"})
            runner.atomic_json(run_dir / "result-summary.json", {"status": "FIRST_TRAINING_RUN_COMPLETED"})
            runner.retract_completion_artifacts(run_dir)
            self.assertFalse((run_dir / "run-manifest.json").exists())
            self.assertFalse((run_dir / "result-summary.json").exists())


if __name__ == "__main__":
    unittest.main()
