import assert from "node:assert/strict";
import test from "node:test";
import { ADAMCODD_V2_RUNTIME_AUTHORITY } from "../../evaluation/imageModeration/adamCoddV2RuntimeAuthority";
import { AdamCoddRuntimeConfigurationError, assertNoRetiredAdamCoddConfiguration, resolveAdamCoddV2ModelPath } from "../../services/imageModeration/adamCoddImageSafety.config";

test("V2 is the only AdamCodd artifact configuration", () => {
  assert.match(resolveAdamCoddV2ModelPath("models/adamcodd-v2/model_int8.onnx") ?? "", /models[\\/]adamcodd-v2[\\/]model_int8\.onnx$/);
  assert.equal(resolveAdamCoddV2ModelPath(undefined), null);
  assert.equal(resolveAdamCoddV2ModelPath("evaluation-output/image-moderation/v2.onnx"), null);
  assert.equal(ADAMCODD_V2_RUNTIME_AUTHORITY.nsfwBlockThreshold, 0.3362914399272772);
});

test("retired V1 settings fail closed", () => {
  assert.doesNotThrow(() => assertNoRetiredAdamCoddConfiguration({ STHN_IMAGE_AI_ADAM_V2_MODEL_PATH: "models/adamcodd-v2/model_int8.onnx" }));
  assert.throws(() => assertNoRetiredAdamCoddConfiguration({ STHN_IMAGE_AI_ADAM_PIPELINE: "V1" }), AdamCoddRuntimeConfigurationError);
  assert.throws(() => assertNoRetiredAdamCoddConfiguration({ STHN_IMAGE_AI_ADAM_MODEL_PATH: "models/adamcodd/model_int8.onnx" }), AdamCoddRuntimeConfigurationError);
});
