# YuNet detector provenance (Stage 3F3 prototype)

The detector adapter is compatible only with the official OpenCV Zoo artifact
`face_detection_yunet_2026may.onnx`, pinned to OpenCV Zoo revision
`47534e27c9851bb1128ccc0102f1145e27f23f98`.

Source: `models/face_detection_yunet/face_detection_yunet_2026may.onnx` in
the OpenCV Zoo repository. The OpenCV Zoo YuNet model directory is distributed
under the MIT License. This repository deliberately does not copy the model
artifact. A deployment must separately provide the exact artifact, whose
SHA-256 and byte length are verified before loading.

This is a detector-only technical prototype. It does not perform identity,
face matching, liveness, anti-spoofing, challenge verification, or automated
profile decisions.
