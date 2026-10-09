import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

import torch

TRAINING = Path(__file__).resolve().parents[2] / "research/textModerationDataset/training"
sys.path.insert(0, str(TRAINING))
RUNNER_PATH = TRAINING / "run_mhs_v2_successor_local_training.py"
MODEL_PATH = TRAINING / "mhs_v2_successor_model.py"


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


runner = load("mhs_v2_successor_runner", RUNNER_PATH)
model = load("mhs_v2_successor_model_tests", MODEL_PATH)


class SuccessorLocalTrainingPreparationTests(unittest.TestCase):
    def tensors(self):
        binary = torch.tensor([[2.0, -1.0], [-1.0, 2.0]], requires_grad=True)
        auxiliary = torch.tensor([[1.0, 0.0, 0.0, 0.0, 0.0], [0.0, 1.0, 0.0, 0.0, 0.0]], requires_grad=True)
        return binary, auxiliary, torch.tensor([0, 1]), torch.tensor([0, 1])

    def test_category_mapping_exact(self):
        self.assertEqual(model.CATEGORY_TO_ID, {"ABUSIVE_OR_HARASSING": 0, "HATE": 1, "PROFANITY": 2, "SEXUAL": 3, "THREAT_OR_VIOLENCE": 4})

    def test_auxiliary_weight_exact(self):
        self.assertEqual(model.AUXILIARY_WEIGHT, 0.25)

    def test_zero_eligible_batch_is_finite_and_zero(self):
        binary, auxiliary, labels, auxiliary_labels = self.tensors()
        result = model.compute_multitask_objective(binary, auxiliary, labels, auxiliary_labels, torch.tensor([0, 0]))
        self.assertTrue(torch.isfinite(result.loss))
        self.assertEqual((result.auxiliary_eligible_count, float(result.auxiliary_loss)), (0, 0.0))

    def test_zero_eligible_batch_keeps_valid_gradient_path(self):
        binary, auxiliary, labels, auxiliary_labels = self.tensors()
        result = model.compute_multitask_objective(binary, auxiliary, labels, auxiliary_labels, torch.tensor([0, 0]))
        result.loss.backward()
        self.assertIsNotNone(binary.grad)
        self.assertIsNotNone(auxiliary.grad)
        self.assertEqual(float(auxiliary.grad.abs().sum()), 0.0)

    def test_mixed_batch_combined_loss_exact(self):
        binary, auxiliary, labels, auxiliary_labels = self.tensors()
        result = model.compute_multitask_objective(binary, auxiliary, labels, auxiliary_labels, torch.tensor([0, 1]))
        self.assertTrue(torch.allclose(result.loss, result.binary_loss + 0.25 * result.auxiliary_loss))
        self.assertEqual(result.auxiliary_eligible_count, 1)

    def test_mixed_batch_auxiliary_gradient(self):
        binary, auxiliary, labels, auxiliary_labels = self.tensors()
        result = model.compute_multitask_objective(binary, auxiliary, labels, auxiliary_labels, torch.tensor([0, 1]))
        result.loss.backward()
        self.assertGreater(float(auxiliary.grad[1].abs().sum()), 0.0)
        self.assertEqual(float(auxiliary.grad[0].abs().sum()), 0.0)

    def test_binary_metrics_include_allow_and_block(self):
        metrics = runner.metric_values([0, 0, 1, 1], [0, 1, 1, 1])
        self.assertEqual(metrics["confusionMatrix"], [[1, 1], [0, 2]])
        self.assertIn("allowF1", metrics)
        self.assertIn("blockF1", metrics)

    def test_checkpoint_higher_binary_macro_f1(self):
        rows = [{"epoch": 1, "macroF1": .4, "binaryValidationLoss": .1}, {"epoch": 2, "macroF1": .6, "binaryValidationLoss": .9}, {"epoch": 3, "macroF1": .5, "binaryValidationLoss": .2}]
        self.assertEqual(runner.select_checkpoint(rows)["epoch"], 2)

    def test_checkpoint_lower_binary_loss_tie(self):
        rows = [{"epoch": 1, "macroF1": .5, "binaryValidationLoss": .4}, {"epoch": 2, "macroF1": .5, "binaryValidationLoss": .3}, {"epoch": 3, "macroF1": .4, "binaryValidationLoss": .1}]
        self.assertEqual(runner.select_checkpoint(rows)["epoch"], 2)

    def test_checkpoint_earlier_epoch_final_tie(self):
        rows = [{"epoch": 1, "macroF1": .5, "binaryValidationLoss": .3}, {"epoch": 2, "macroF1": .5, "binaryValidationLoss": .3}, {"epoch": 3, "macroF1": .4, "binaryValidationLoss": .1}]
        self.assertEqual(runner.select_checkpoint(rows)["epoch"], 1)

    def test_low_total_and_available_ram_are_diagnostic_only(self):
        memory = SimpleNamespace(total=1, available=1)
        disk = SimpleNamespace(free=1)
        result = runner.resource_diagnostics(Path(tempfile.gettempdir()) / "absent", memory, disk)
        self.assertEqual((result["totalRamBytes"], result["availableRamBytes"], result["authoritativeForEligibility"]), (1, 1, False))

    def test_authority_preflight_accepts_low_ram_diagnostics(self):
        memory = SimpleNamespace(total=1, available=1)
        disk = SimpleNamespace(free=1)
        result = runner.authority_preflight(memory=memory, disk=disk)
        self.assertFalse(result["resources"]["authoritativeForEligibility"])

    def test_preflight_category_counts_exact(self):
        result = runner.authority_preflight()
        train = [row for row in result["train"] if row["auxiliaryMask"]]
        validation = [row for row in result["validation"] if row["auxiliaryMask"]]
        self.assertEqual((len(train), len(validation)), (90, 4))

    def test_allow_rows_are_masked(self):
        result = runner.authority_preflight()
        self.assertTrue(all(row["auxiliaryMask"] == 0 for row in result["train"] if row["target"] == 0))

    def test_supported_block_rows_are_eligible(self):
        result = runner.authority_preflight()
        self.assertTrue(all(row["auxiliaryMask"] == 1 for row in result["train"] if row["target"] == 1))

    def test_atomic_writer_refuses_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "artifact.json"
            runner.atomic_json(target, {"status": "FIRST"})
            with self.assertRaises(RuntimeError):
                runner.atomic_json(target, {"status": "SECOND"})
            self.assertEqual(json.loads(target.read_text()), {"status": "FIRST"})

    def test_lifecycle_interruption_is_nonterminal(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            runner.atomic_json(root / "lifecycle.json", {"status": "RUNNING"})
            runner.mark_nonterminal(root, {"status": "RUNNING", "completedAt": None}, "INTERRUPTED", "KeyboardInterrupt", "interrupted")
            self.assertEqual(json.loads((root / "lifecycle.json").read_text())["status"], "INTERRUPTED")
            self.assertFalse((root / "run-manifest.json").exists())


if __name__ == "__main__":
    unittest.main()
