export const QWEN3_VL_ERROR_REVIEW_SCHEMA_V1 = "STHN_QWEN3_VL_ERROR_REVIEW_V1" as const;
export const QWEN3_VL_ERROR_REVIEW_SCHEMA_V2 = "STHN_QWEN3_VL_ERROR_REVIEW_V2" as const;
export const QWEN3_VL_ERROR_REVIEW_VERDICTS = ["QWEN_RIGHT", "HUMAN_RIGHT", "NOT_SURE"] as const;
export type Qwen3VlErrorReviewVerdict = (typeof QWEN3_VL_ERROR_REVIEW_VERDICTS)[number];
export interface Qwen3VlErrorReviewV2Annotation { readonly fixtureId: string; readonly reviewerVerdict: Qwen3VlErrorReviewVerdict; readonly notes: string; readonly completedAt: string; }
export interface Qwen3VlErrorReviewImport { readonly schemaVersion: typeof QWEN3_VL_ERROR_REVIEW_SCHEMA_V1 | typeof QWEN3_VL_ERROR_REVIEW_SCHEMA_V2; readonly annotations: readonly Qwen3VlErrorReviewV2Annotation[]; readonly legacyAnnotations: readonly unknown[]; }
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const validV2 = (value: unknown, ids: ReadonlySet<string>): value is Qwen3VlErrorReviewV2Annotation => record(value) && typeof value.fixtureId === "string" && ids.has(value.fixtureId) && QWEN3_VL_ERROR_REVIEW_VERDICTS.includes(value.reviewerVerdict as Qwen3VlErrorReviewVerdict) && typeof value.notes === "string" && value.notes.length <= 4_000 && typeof value.completedAt === "string";
/** V1 diagnostics are preserved separately; no diagnostic classification is translated into a verdict. */
export const validateQwen3VlErrorReviewImport = (value: unknown, ids: ReadonlySet<string>): Qwen3VlErrorReviewImport => {
  if (!record(value) || value.runId !== "STHN_QWEN3_VL_V2C_558_V1" || typeof value.exportedAt !== "string" || !Array.isArray(value.annotations)) throw new Error("Qwen error-review export is incompatible");
  if (value.schemaVersion === QWEN3_VL_ERROR_REVIEW_SCHEMA_V1) return Object.freeze({ schemaVersion: QWEN3_VL_ERROR_REVIEW_SCHEMA_V1, annotations: [], legacyAnnotations: value.annotations });
  if (value.schemaVersion !== QWEN3_VL_ERROR_REVIEW_SCHEMA_V2) throw new Error("Qwen error-review export schema is incompatible");
  const seen = new Set<string>(); for (const annotation of value.annotations) { if (!validV2(annotation, ids) || seen.has(annotation.fixtureId)) throw new Error("Qwen error-review annotation is invalid"); seen.add(annotation.fixtureId); }
  if (value.legacyAnnotations !== undefined && !Array.isArray(value.legacyAnnotations)) throw new Error("Qwen error-review legacy annotations are invalid");
  return Object.freeze({ schemaVersion: QWEN3_VL_ERROR_REVIEW_SCHEMA_V2, annotations: value.annotations as Qwen3VlErrorReviewV2Annotation[], legacyAnnotations: value.legacyAnnotations ?? [] });
};
export const analyzeQwen3VlErrorReviews = (annotations: readonly Qwen3VlErrorReviewV2Annotation[], rows: readonly Readonly<{ fixtureId: string; queue: "PRIMARY" | "SECONDARY"; humanCategories: readonly string[] }>[]) => {
  const reviewed = new Map(annotations.map((annotation) => [annotation.fixtureId, annotation])); const categories = [...new Set(rows.flatMap((row) => row.humanCategories))].sort();
  return { totalReviewItems: rows.length, reviewed: reviewed.size, unreviewed: rows.length - reviewed.size, byVerdict: Object.fromEntries(QWEN3_VL_ERROR_REVIEW_VERDICTS.map((verdict) => [verdict, annotations.filter((annotation) => annotation.reviewerVerdict === verdict).length])), secondaryFalseBlocks: rows.filter((row) => row.queue === "SECONDARY").map((row) => ({ fixtureId: row.fixtureId, reviewed: reviewed.has(row.fixtureId), reviewerVerdict: reviewed.get(row.fixtureId)?.reviewerVerdict ?? null })), categoryCounts: Object.fromEntries(categories.map((category) => [category, { totalItems: rows.filter((row) => row.humanCategories.includes(category)).length, reviewedItems: rows.filter((row) => row.humanCategories.includes(category) && reviewed.has(row.fixtureId)).length }])) };
};
