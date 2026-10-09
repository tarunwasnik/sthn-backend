import importlib.util
import json
import math
import tempfile
import unittest
from pathlib import Path

RUNNER = Path(__file__).resolve().parents[2] / "research/textModerationDataset/training/run_mhs_v2_controlled_evaluation.py"
SPEC = importlib.util.spec_from_file_location("controlled_evaluation", RUNNER)
module = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(module)


class ControlledEvaluationSyntheticTests(unittest.TestCase):
    def test_argmax_allow(self): self.assertEqual(module.prediction_from_logits([2.0, 1.0]), 0)
    def test_argmax_block(self): self.assertEqual(module.prediction_from_logits([1.0, 2.0]), 1)
    def test_tie_is_allow(self): self.assertEqual(module.prediction_from_logits([1.0, 1.0]), 0)
    def test_softmax_stable(self): self.assertAlmostEqual(sum(module.stable_softmax([10000.0, 9999.0])), 1.0)
    def test_nan_rejected(self): self.assertRaises(ValueError, module.stable_softmax, [math.nan, 0.0])
    def test_inf_rejected(self): self.assertRaises(ValueError, module.stable_softmax, [math.inf, 0.0])
    def test_wrong_logit_shape_rejected(self): self.assertRaises(ValueError, module.stable_softmax, [0.0])
    def test_metrics_perfect(self): self.assertEqual(module.metric_values([0, 1], [0, 1])["confusionMatrix"], [[1, 0], [0, 1]])
    def test_allow_metrics(self): self.assertEqual(module.metric_values([0, 1], [0, 1])["allowF1"], 1.0)
    def test_block_metrics(self): self.assertEqual(module.metric_values([0, 1], [0, 1])["blockF1"], 1.0)
    def test_zero_denominator(self): self.assertEqual(module.metric_values([0, 0], [0, 0])["blockF1"], 0.0)

    def rows(self):
        return [{"source":"SYNTHETIC","exampleId":"one","text":"alpha","textSha256":module.sha_bytes(b"alpha"),"trueDecision":"ALLOW","trueTarget":0},{"source":"SYNTHETIC","exampleId":"two","text":"beta","textSha256":module.sha_bytes(b"beta"),"trueDecision":"BLOCK","trueTarget":1}]

    def test_source_valid(self): module.validate_source_rows(self.rows(), "SYNTHETIC", ["one", "two"], 2, {"ALLOW":1,"BLOCK":1})
    def test_duplicate_rejected(self): self.assertRaises(ValueError, module.validate_source_rows, [self.rows()[0], self.rows()[0]], "SYNTHETIC", ["one", "two"], 2)
    def test_missing_rejected(self): self.assertRaises(ValueError, module.validate_source_rows, self.rows()[:1], "SYNTHETIC", ["one", "two"], 2)
    def test_unexpected_rejected(self):
        rows=self.rows(); rows[1]={**rows[1],"exampleId":"other"}; self.assertRaises(ValueError,module.validate_source_rows,rows,"SYNTHETIC",["one","two"],2)
    def test_wrong_class_count_rejected(self): self.assertRaises(ValueError,module.validate_source_rows,self.rows(),"SYNTHETIC",["one","two"],2,{"ALLOW":2,"BLOCK":0})
    def test_text_hash_is_exact_utf8(self):
        rows=self.rows(); rows[0]={**rows[0],"textSha256":"0"*64}; self.assertRaises(ValueError,module.validate_source_rows,rows,"SYNTHETIC",["one","two"],2)
    def test_raw_text_result_rejected(self): self.assertRaises(ValueError,module.validate_result_record,{"text":"forbidden"})

    def result(self):
        return {"source":"SYNTHETIC","exampleId":"one","textSha256":"0"*64,"trueDecision":"ALLOW","trueTarget":0,"predictedDecision":"ALLOW","predictedTarget":0,"allowLogit":1.0,"blockLogit":0.0,"allowScore":0.7310585786300049,"blockScore":0.2689414213699951,"correct":True}

    def test_result_schema_valid(self): module.validate_result_record(self.result())
    def test_nonfinite_result_rejected(self):
        row=self.result(); row["allowLogit"]=math.nan; self.assertRaises(ValueError,module.validate_result_record,row)
    def test_lifecycle_no_exposure_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            run=Path(directory); lifecycle=run/"lifecycle.json"; module.write_new(lifecycle,{"status":"RUNNING","internalTestAccessed":False,"benchmarkAccessed":False}); state=json.loads(lifecycle.read_text()); module.mark_failure(lifecycle,state,"PREFLIGHT","synthetic"); self.assertFalse(json.loads(lifecycle.read_text())["internalTestAccessed"])
    def test_lifecycle_internal_exposure_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            run=Path(directory); lifecycle=run/"lifecycle.json"; ledger=run/"protected-exposure-ledger.jsonl"; module.write_new(lifecycle,{"status":"RUNNING"}); module.append_exposure(ledger,"INTERNAL_TEST","INTERNAL_TEST_ACCESS_STARTED"); state=json.loads(lifecycle.read_text()); module.mark_failure(lifecycle,state,"INTERNAL","synthetic"); saved=json.loads(lifecycle.read_text()); self.assertTrue(saved["internalTestAccessed"]); self.assertFalse(saved["benchmarkAccessed"])
    def test_lifecycle_benchmark_failure_preserves_both(self):
        with tempfile.TemporaryDirectory() as directory:
            run=Path(directory); lifecycle=run/"lifecycle.json"; ledger=run/"protected-exposure-ledger.jsonl"; module.write_new(lifecycle,{"status":"RUNNING"}); module.append_exposure(ledger,"INTERNAL_TEST","INTERNAL_TEST_ACCESS_STARTED"); module.append_exposure(ledger,"INTERNAL_TEST","INTERNAL_TEST_EVALUATION_COMPLETED"); module.append_exposure(ledger,"EXTERNAL_BENCHMARK","EXTERNAL_BENCHMARK_ACCESS_STARTED"); state=json.loads(lifecycle.read_text()); module.mark_failure(lifecycle,state,"BENCHMARK","synthetic"); saved=json.loads(lifecycle.read_text()); self.assertTrue(saved["internalTestAccessed"] and saved["benchmarkAccessed"]); self.assertFalse(saved["benchmarkEvaluated"])
    def test_completion_requires_all_events(self):
        with tempfile.TemporaryDirectory() as directory:
            ledger=Path(directory)/"protected-exposure-ledger.jsonl"; module.append_exposure(ledger,"INTERNAL_TEST","INTERNAL_TEST_ACCESS_STARTED"); self.assertFalse(module.exposure_state(ledger)["complete"])
    def test_complete_sequence(self):
        with tempfile.TemporaryDirectory() as directory:
            ledger=Path(directory)/"protected-exposure-ledger.jsonl"
            for source,event in (("INTERNAL_TEST","INTERNAL_TEST_ACCESS_STARTED"),("INTERNAL_TEST","INTERNAL_TEST_EVALUATION_COMPLETED"),("EXTERNAL_BENCHMARK","EXTERNAL_BENCHMARK_ACCESS_STARTED"),("EXTERNAL_BENCHMARK","EXTERNAL_BENCHMARK_EVALUATION_COMPLETED")): module.append_exposure(ledger,source,event)
            self.assertTrue(module.exposure_state(ledger)["complete"])
    def test_out_of_order_exposure_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            ledger=Path(directory)/"protected-exposure-ledger.jsonl"; module.append_exposure(ledger,"EXTERNAL_BENCHMARK","EXTERNAL_BENCHMARK_ACCESS_STARTED"); self.assertRaises(RuntimeError,module.exposure_state,ledger)
    def test_overwrite_refused(self):
        with tempfile.TemporaryDirectory() as directory:
            target=Path(directory)/"value.json"; module.write_new(target,{"a":1}); self.assertRaises(RuntimeError,module.write_new,target,{"a":2})
    def test_low_memory_diagnostics_do_not_fail(self):
        result=module.authority_preflight(require_empty_output=False,memory_diagnostics={"availableRamBytes":1,"totalRamBytes":1}); self.assertFalse(result["resourceDiagnostics"]["authoritativeForEligibility"])
    def test_import_preserves_completed_output_state(self):
        output=module.repository_paths()[1]["output"]; self.assertTrue(output.exists()); self.assertEqual(json.loads((output/"run"/"lifecycle.json").read_text())["status"],"COMPLETED")


if __name__ == "__main__": unittest.main()
