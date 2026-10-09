import { OriginalLabels, ProvenanceStagingRow, RestrictedSidecarRecord, SourceId } from "./contracts";
import { CsvRecord } from "./csv";
import { exampleIdFromSourceRow, relationshipGroupId, sourceRowId } from "./identity";
import { sourceRegistry } from "./registries";
import { CivilCommentRecord, MeasuringHateSpeechRecord, validateCivilComments, validateHatemoji, validateMeasuringHateSpeech, validateToxigen } from "./validators";

const scriptOf = (text: string): ProvenanceStagingRow["script"] => {
  const latin = /[A-Za-z]/u.test(text); const devanagari = /[\u0900-\u097f]/u.test(text); const thai = /[\u0e00-\u0e7f]/u.test(text);
  const count = Number(latin) + Number(devanagari) + Number(thai);
  if (count > 1) return "MIXED"; if (devanagari) return "DEVANAGARI"; if (thai) return "THAI"; if (latin) return "LATIN";
  return text.trim() ? "OTHER" : "UNKNOWN";
};

const base = (sourceId: SourceId, nativeRowId: string, text: string, split: string, retrievedAt: string, originalLabels: OriginalLabels, sourceType: ProvenanceStagingRow["sourceType"], identityCoordinates?: readonly (string | number)[]): ProvenanceStagingRow => {
  const source = sourceRegistry[sourceId]; const id = sourceRowId(sourceId, ...(identityCoordinates ?? [source.revision, split, nativeRowId]));
  return { schemaVersion: "STHN_TEXT_MODERATION_DATASET_SCHEMA_V1", policyVersion: "STHN_TEXT_MODERATION_POLICY_V1", exampleId: exampleIdFromSourceRow(id), text,
    decision: null, primaryCategory: null, secondaryCategories: [], policyReasonCode: null, domain: "GENERAL_PUBLIC_DATA", targetField: "GENERAL_TEXT",
    language: source.languageCoverage.length === 1 ? source.languageCoverage[0] : "und", script: scriptOf(text), codeSwitch: "UNKNOWN", difficulty: null,
    sourceType, sourceDataset: sourceId, sourceVersion: source.version, sourceRowId: id, sourceSplit: split, sourceLicense: source.sourceTextLicenseKey,
    sourceUrl: source.authoritativeUrl, retrievedAt, originalLabels, mappingVersion: null, lineageRootId: null, transformationHistory: [], generator: null,
    nearPairGroupId: null, templateFamilyId: null, duplicateGroupId: null, semanticGroupId: null, piiStatus: "REQUIRES_REVIEW", piiTypes: [],
    annotationStatus: "DRAFT", annotatorCount: 0, agreement: "NOT_APPLICABLE", adjudicated: false, split: "UNASSIGNED", createdAt: retrievedAt, updatedAt: retrievedAt };
};

export const stageHatemoji = (rows: readonly CsvRecord[], split: string, retrievedAt: string): readonly ProvenanceStagingRow[] => {
  validateHatemoji(rows, split);
  return rows.map((row) => {
    const staged = base("HATEMOJI_BUILD", row.entry_id, row.text, split, retrievedAt,
      { type: row.type, target: row.target, "round.base": row["round.base"], "round.set": row["round.set"], set: row.set, label_gold: row.label_gold, matched_id: row.matched_id }, "PUBLIC_SYNTHETIC", [sourceRegistry.HATEMOJI_BUILD.revision, row.entry_id]);
    const pair = row.matched_id ? relationshipGroupId("pair", row.entry_id, row.matched_id) : null;
    return { ...staged, nearPairGroupId: pair, lineageRootId: pair };
  });
};

export const stageToxigen = (rows: readonly CsvRecord[], split: string, artifactId: string, retrievedAt: string): readonly ProvenanceStagingRow[] => {
  validateToxigen(rows);
  return rows.map((row, index) => ({ ...base("TOXIGEN_ANNOTATED", `${artifactId}:${index + 1}`, row.text, split, retrievedAt,
    Object.fromEntries(Object.entries(row).filter(([key]) => key !== "text")), "PUBLIC_SYNTHETIC"),
    generator: { generatorId: "ToxiGen", version: sourceRegistry.TOXIGEN_ANNOTATED.revision, batchId: null } }));
};

export const stageCivilComment = (row: CivilCommentRecord, split: string, retrievedAt: string): ProvenanceStagingRow =>
  base("CIVIL_COMMENTS_1_2_4", String(row.id), row.text, split, retrievedAt,
    { toxicity: row.toxicity, severe_toxicity: row.severe_toxicity, obscene: row.obscene, threat: row.threat, insult: row.insult, identity_attack: row.identity_attack, sexual_explicit: row.sexual_explicit },
    "PUBLIC_HUMAN", [sourceRegistry.CIVIL_COMMENTS_1_2_4.version, "CivilComments", split, String(row.id)]);

export const stageCivilComments = (rows: readonly CivilCommentRecord[], split: string, retrievedAt: string): readonly ProvenanceStagingRow[] => {
  validateCivilComments(rows);
  return rows.map((row) => stageCivilComment(row, split, retrievedAt));
};

const isRestrictedMhsKey = (key: string): boolean => key === "annotator_id" || key.startsWith("annotator_");
export const stageMeasuringHateSpeech = (rows: readonly MeasuringHateSpeechRecord[], retrievedAt: string): { rows: readonly ProvenanceStagingRow[]; restrictedSidecars: readonly RestrictedSidecarRecord[] } => {
  validateMeasuringHateSpeech(rows);
  const grouped = new Map<string, MeasuringHateSpeechRecord[]>();
  rows.forEach((row) => grouped.set(String(row.comment_id), [...(grouped.get(String(row.comment_id)) ?? []), row]));
  const staged = [...grouped.entries()].map(([commentId, annotations]) => {
    const labelKeys = [...new Set(annotations.flatMap((row) => Object.keys(row)))].filter((key) => key !== "text" && key !== "comment_id" && !isRestrictedMhsKey(key));
    const labels = Object.fromEntries(labelKeys.map((key) => [key, annotations.map((row) => row[key] ?? null)]));
    return base("MEASURING_HATE_SPEECH", commentId, annotations[0].text, "train", retrievedAt, labels, "PUBLIC_HUMAN",
      [sourceRegistry.MEASURING_HATE_SPEECH.revision, commentId]);
  });
  const restrictedSidecars = rows.map((row) => ({ sourceId: "MEASURING_HATE_SPEECH" as const,
    sourceRowId: sourceRowId("MEASURING_HATE_SPEECH", sourceRegistry.MEASURING_HATE_SPEECH.revision, String(row.comment_id), String(row.annotator_id)), restricted: true as const,
    metadata: Object.fromEntries(Object.entries(row).filter(([key]) => isRestrictedMhsKey(key))) }));
  return { rows: staged, restrictedSidecars };
};
