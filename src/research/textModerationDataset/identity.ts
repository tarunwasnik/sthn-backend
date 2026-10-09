import crypto from "node:crypto";

import { SourceId } from "./contracts";

const digest = (parts: readonly (string | number)[]): string =>
  crypto.createHash("sha256").update(JSON.stringify(parts), "utf8").digest("hex");

export const sourceRowId = (sourceId: SourceId, ...coordinates: readonly (string | number)[]): string =>
  `src_${digest([sourceId, ...coordinates])}`;

export const exampleIdFromSourceRow = (id: string): string => `pub_${digest(["STHN_PUBLIC_EXAMPLE", id])}`;
export const relationshipGroupId = (kind: "pair" | "lineage", ...nativeIds: readonly string[]): string =>
  `${kind}_${digest([kind, ...[...nativeIds].sort()])}`;

export const TEXT_DUPLICATE_NORMALIZATION_VERSION = "STHN_TEXT_DUPLICATE_NORMALIZATION_NFKC_LOWER_WHITESPACE_V1" as const;
export const normalizeTextForDuplicateDetection = (text: string): string =>
  text.normalize("NFKC").toLowerCase().trim().replace(/\s+/g, " ");
export const textDuplicateFingerprint = (text: string): string =>
  digest(["TEXT_DUPLICATE", TEXT_DUPLICATE_NORMALIZATION_VERSION, normalizeTextForDuplicateDetection(text)]);
