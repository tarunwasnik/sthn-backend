import assert from "node:assert/strict";
import test from "node:test";
import { R2_SHARP_KERNELS, selectR2ResizeKernel } from "../../evaluation/imageModeration/nudeNet320nResizeParity";

test("R2 resize selection uses only frozen preprocessing metrics with deterministic ties and a fail-closed criterion", () => {
  const metrics = R2_SHARP_KERNELS.map((kernel, index) => ({ kernel, aggregateMae: index === 0 ? 1 : index === 1 ? 0.2 : 0.3, differingBytes: 100 + index, perCandidateMae: [0.2, 0.2, 0.2, 0.2] }));
  const result = selectR2ResizeKernel(metrics);
  assert.equal(result.selected.kernel, "cubic");
  assert.equal(result.passes, true);
  assert.equal(selectR2ResizeKernel(R2_SHARP_KERNELS.map((kernel) => ({ kernel, aggregateMae: 1, differingBytes: 1, perCandidateMae: [1, 1, 1, 1] }))).passes, false);
});
