# Profile-verification model notices

The following OpenCV Zoo ONNX artifacts are tracked in this repository and
loaded only after the runtime verifies their pinned byte length and SHA-256.
They are third-party model artifacts; this notice does not alter their runtime
paths, checksums, or deployment behavior.

## YuNet face detector

- Local artifact: `models/face_detection_yunet_2026may.onnx`
- Upstream source: OpenCV Zoo,
  `models/face_detection_yunet/face_detection_yunet_2026may.onnx`, revision
  `47534e27c9851bb1128ccc0102f1145e27f23f98`
- License: MIT License
- Required upstream copyright notice: Copyright (c) 2020 Shiqi Yu
- Authoritative license text:
  <https://github.com/opencv/opencv_zoo/blob/main/models/face_detection_yunet/LICENSE>

The upstream MIT terms require the copyright and permission notice to accompany
copies or substantial portions of the software. The artifact is retained with
this attribution for that purpose.

## SFace face-recognition embedding model

- Local artifact: `models/face_recognition_sface_2021dec.onnx`
- Upstream source: OpenCV Zoo,
  `models/face_recognition_sface/face_recognition_sface_2021dec.onnx`
- License: Apache License, Version 2.0
- Authoritative license text:
  <https://github.com/opencv/opencv_zoo/blob/main/models/face_recognition_sface/LICENSE>

The SFace upstream directory distributes its model under Apache-2.0. Any
redistribution must retain the applicable license and notices under its terms.

## Runtime scope

YuNet is a detector and SFace supplies embeddings for the existing
profile-verification workflow. They do not independently authorize identity,
liveness, anti-spoofing, challenge verification, or automated profile
decisions.
