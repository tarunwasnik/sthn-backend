import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";

import { createProfileVerificationSubmittedMediaSnapshot } from "../../services/profile/profileVerificationSubmittedMedia.service";
import { analyseLiveCaptureProfileMediaShadow } from "../../services/profile/profileVerificationLiveMediaShadowAnalysis.service";

const vector = (first: number) => [first, ...Array.from({ length: 127 }, () => 0)];
const face = (offset = 0) => ({ x: 2 + offset, y: 2, width: 14, height: 14, confidence: 0.9, landmarks: { rightEye: { x: 6 + offset, y: 7 }, leftEye: { x: 12 + offset, y: 7 }, noseTip: { x: 9 + offset, y: 10 }, rightMouthCorner: { x: 6 + offset, y: 14 }, leftMouthCorner: { x: 12 + offset, y: 14 } } });
const snapshot = createProfileVerificationSubmittedMediaSnapshot({ avatar: "https://example.test/avatar.jpg", cover: "https://example.test/cover.jpg", profilePhotos: ["https://example.test/one.jpg", "https://example.test/two.jpg"] });
const image = async (colour: { r: number; g: number; b: number }) => sharp({ create: { width: 24, height: 24, channels: 3, background: colour } }).png().toBuffer();

test("live captures rank every usable face in frozen media and retain second-best ambiguity evidence", async () => {
  const avatar = await image({ r: 10, g: 0, b: 0 }); const cover = await image({ r: 0, g: 10, b: 0 }); const one = await image({ r: 0, g: 0, b: 10 }); const two = await image({ r: 10, g: 10, b: 0 });
  const bytes = new Map([[snapshot.avatar.sourceReference, avatar], [snapshot.cover.sourceReference, cover], [snapshot.profilePhotos[0].sourceReference, one], [snapshot.profilePhotos[1].sourceReference, two]]);
  const calls: number[] = [];
  const result = await analyseLiveCaptureProfileMediaShadow({
    snapshot, usableLiveEmbeddings: [vector(1), vector(1), vector(1), vector(1), vector(1)],
    readMedia: async (item) => bytes.get(item.sourceReference)!,
    detector: async (encoded) => ({ width: 24, height: 24, decodedBytes: encoded.length, faces: encoded === avatar ? [face()] : encoded === cover ? [] : encoded === one ? [face(), face(1)] : [face()] }),
    embedder: async () => vector(calls.push(1) <= 2 ? 1 : calls.length === 3 ? -1 : 1),
  });
  assert.equal(result.live.usableCaptureCount, 5);
  assert.equal(result.live.pairwiseComparisonCount, 10);
  assert.equal(result.live.minimumSimilarity, 1);
  assert.equal(result.summary.submittedMediaCount, 4);
  assert.equal(result.summary.mediaWithNoFaceCount, 1);
  const group = result.media.find((item) => item.profilePhotoIndex === 0)!;
  assert.equal(group.status, "FACE_CANDIDATES_AVAILABLE");
  assert.equal(group.candidateCount, 2);
  assert.equal(group.bestCandidate?.candidateIndex, 0);
  assert.equal(group.bestCandidate?.medianSimilarity, 1);
  assert.equal(group.secondBestMedianSimilarity, -1);
  assert.equal(group.bestVsSecondMargin, 2);
});

test("legacy snapshots and insufficient live sets are unavailable without reading mutable media", async () => {
  let reads = 0;
  const legacy = await analyseLiveCaptureProfileMediaShadow({ snapshot: undefined, usableLiveEmbeddings: [vector(1), vector(1), vector(1)], readMedia: async () => { reads += 1; return Buffer.alloc(0); } });
  assert.equal(legacy.reasonCode, "MEDIA_SNAPSHOT_UNAVAILABLE");
  const insufficient = await analyseLiveCaptureProfileMediaShadow({ snapshot, usableLiveEmbeddings: [vector(1), vector(1)], readMedia: async () => { reads += 1; return Buffer.alloc(0); } });
  assert.equal(insufficient.reasonCode, "INSUFFICIENT_USABLE_LIVE_CAPTURES");
  assert.equal(reads, 0);
});

test("unreadable and no-face media are excluded evidence rather than identity mismatch", async () => {
  const noFace = await image({ r: 1, g: 1, b: 1 });
  const result = await analyseLiveCaptureProfileMediaShadow({
    snapshot, usableLiveEmbeddings: [vector(1), vector(1), vector(1)],
    readMedia: async (item) => { if (item.role === "COVER") throw new Error("unavailable"); return noFace; },
    detector: async (encoded) => ({ width: 24, height: 24, decodedBytes: encoded.length, faces: [] }),
    embedder: async () => vector(1),
  });
  assert.equal(result.media.find((item) => item.role === "COVER")?.status, "MEDIA_READ_FAILED");
  assert.ok(result.media.filter((item) => item.status === "NO_FACE").length >= 1);
  assert.equal(result.media.some((item) => "mismatch" in item), false);
});

test("gated media processing remains sequential while evaluating all eight media items and every detected face", async () => {
  const sixPhotoSnapshot = createProfileVerificationSubmittedMediaSnapshot({
    avatar: "https://example.test/sequential-avatar.jpg",
    cover: "https://example.test/sequential-cover.jpg",
    profilePhotos: Array.from({ length: 6 }, (_, index) => `https://example.test/sequential-${index}.jpg`),
  });
  const bytes = await image({ r: 12, g: 34, b: 56 });
  let activeReads = 0; let maxActiveReads = 0;
  let activeDetections = 0; let maxActiveDetections = 0;
  let activeEmbeddings = 0; let maxActiveEmbeddings = 0;
  let reads = 0; let detections = 0; let embeddings = 0;
  const yieldTurn = () => new Promise<void>((resolve) => setImmediate(resolve));
  const result = await analyseLiveCaptureProfileMediaShadow({
    snapshot: sixPhotoSnapshot,
    usableLiveEmbeddings: [vector(1), vector(1), vector(1), vector(1), vector(1)],
    readMedia: async () => {
      reads += 1; activeReads += 1; maxActiveReads = Math.max(maxActiveReads, activeReads);
      await yieldTurn(); activeReads -= 1; return bytes;
    },
    detector: async () => {
      detections += 1; activeDetections += 1; maxActiveDetections = Math.max(maxActiveDetections, activeDetections);
      await yieldTurn(); activeDetections -= 1;
      return { width: 24, height: 24, decodedBytes: bytes.length, faces: detections === 2 ? [face(), face(1)] : [face()] };
    },
    embedder: async () => {
      embeddings += 1; activeEmbeddings += 1; maxActiveEmbeddings = Math.max(maxActiveEmbeddings, activeEmbeddings);
      await yieldTurn(); activeEmbeddings -= 1; return vector(1);
    },
  });
  assert.deepEqual({ reads, detections, embeddings }, { reads: 8, detections: 8, embeddings: 9 });
  assert.deepEqual({ maxActiveReads, maxActiveDetections, maxActiveEmbeddings }, { maxActiveReads: 1, maxActiveDetections: 1, maxActiveEmbeddings: 1 });
  assert.equal(result.live.usableCaptureCount, 5);
  assert.equal(result.live.pairwiseComparisonCount, 10);
  assert.equal(result.summary.submittedMediaCount, 8);
  assert.equal(result.summary.processedMediaCount, 8);
  assert.equal(result.summary.mediaWithUsableFacesCount, 8);
  assert.equal(result.summary.multiFaceMediaCount, 1);
  assert.equal(result.media.reduce((sum, item) => sum + item.candidateCount, 0), 9);
});
