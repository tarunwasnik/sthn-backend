import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { resolveCollectionCQualificationAsset } from "../../scripts/collectionCQualificationPath";

const root = path.resolve("collection-c-source");
const expected = (...parts: string[]) => path.join(root, ...parts);

test("resolves Windows-style Collection C manifest paths on every host", () => {
  assert.equal(
    resolveCollectionCQualificationAsset(root, "01_PASS\\04_beachwear_swimwear\\andrew-valdivia-GZ6whV2o5p4-unsplash.jpg"),
    expected("01_PASS", "04_beachwear_swimwear", "andrew-valdivia-GZ6whV2o5p4-unsplash.jpg"),
  );
});

test("resolves POSIX-style Collection C manifest paths on every host", () => {
  assert.equal(
    resolveCollectionCQualificationAsset(root, "02_BLOCK/02_sexualized_and_suggestive/marlon-alves-wfQr2hDMDtk-unsplash.jpg"),
    expected("02_BLOCK", "02_sexualized_and_suggestive", "marlon-alves-wfQr2hDMDtk-unsplash.jpg"),
  );
});

test("rejects absolute and drive-qualified Collection C manifest paths", () => {
  for (const candidate of ["/etc/passwd", "C:\\benchmark\\image.jpg", "C:/benchmark/image.jpg", "\\\\server\\share\\image.jpg"]) {
    assert.throws(() => resolveCollectionCQualificationAsset(root, candidate), /must be relative/u);
  }
});

test("rejects traversal and malformed Collection C manifest paths", () => {
  for (const candidate of ["../image.jpg", "01_PASS/../image.jpg", "01_PASS\\..\\image.jpg", "./image.jpg", "01_PASS//image.jpg", ""]) {
    assert.throws(() => resolveCollectionCQualificationAsset(root, candidate), /unsafe segment|missing or invalid/u);
  }
});
