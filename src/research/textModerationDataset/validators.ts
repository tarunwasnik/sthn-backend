import { CsvRecord } from "./csv";

export const HATEMOJI_COLUMNS = ["entry_id", "text", "type", "target", "round.base", "round.set", "set", "split", "label_gold", "matched_text", "matched_id"] as const;
export const TOXIGEN_COLUMNS = ["text", "target_group", "factual?", "ingroup_effect", "lewd", "framing", "predicted_group", "stereotyping", "intent", "toxicity_ai", "toxicity_human", "predicted_author", "actual_method"] as const;
export const TOXIGEN_TEST_COLUMNS = [...TOXIGEN_COLUMNS.slice(0, 12), "label", "actual_method"] as const;

const columns = (row: CsvRecord): string[] => Object.keys(row);
const exactColumns = (row: CsvRecord, expected: readonly string[], source: string): void => {
  const actual = columns(row);
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    throw new Error(`${source} schema drift: expected [${expected.join(",")}], received [${actual.join(",")}]`);
  }
};
const present = (row: CsvRecord, key: string, source: string): string => {
  const value = row[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${source} missing ${key}`);
  return value;
};
const unique = (values: readonly string[], source: string): void => {
  if (new Set(values).size !== values.length) throw new Error(`${source} contains duplicate native row identifiers`);
};

export const validateHatemoji = (rows: readonly CsvRecord[], expectedSplit: string): void => {
  if (!rows.length) throw new Error("Hatemoji artifact is empty");
  rows.forEach((row) => {
    exactColumns(row, HATEMOJI_COLUMNS, "Hatemoji");
    present(row, "entry_id", "Hatemoji"); present(row, "text", "Hatemoji");
    if (row.split !== expectedSplit) throw new Error(`Hatemoji split mismatch: ${row.split}`);
    if (!/^[01]$/.test(row.label_gold)) throw new Error(`Hatemoji invalid label_gold: ${row.label_gold}`);
  });
  unique(rows.map((row) => row.entry_id), "Hatemoji");
};

export const validateToxigen = (rows: readonly CsvRecord[]): void => {
  if (!rows.length) throw new Error("ToxiGen artifact is empty");
  rows.forEach((row) => {
    const actual = columns(row);
    const expected = actual.includes("label") ? TOXIGEN_TEST_COLUMNS : TOXIGEN_COLUMNS;
    exactColumns(row, expected, "ToxiGen");
    present(row, "text", "ToxiGen"); present(row, "target_group", "ToxiGen");
    for (const key of ["toxicity_ai", "toxicity_human"]) {
      const value = Number(row[key]);
      if (!Number.isFinite(value) || value < 1 || value > 5) throw new Error(`ToxiGen invalid ${key}: ${row[key]}`);
    }
  });
};

export interface CivilCommentRecord { id: string | number; text: string; toxicity: number; severe_toxicity: number; obscene: number; threat: number; insult: number; identity_attack: number; sexual_explicit: number; }
export const validateCivilComments = (rows: readonly CivilCommentRecord[]): void => {
  if (!rows.length) throw new Error("Civil Comments artifact is empty");
  unique(rows.map((row) => String(row.id)), "Civil Comments");
  rows.forEach((row) => {
    if (!String(row.id).trim() || !row.text.trim()) throw new Error("Civil Comments missing id or text");
    for (const key of ["toxicity", "severe_toxicity", "obscene", "threat", "insult", "identity_attack", "sexual_explicit"] as const) {
      if (!Number.isFinite(row[key]) || row[key] < 0 || row[key] > 1) throw new Error(`Civil Comments invalid ${key}`);
    }
  });
};

export interface MeasuringHateSpeechRecord { comment_id: string | number; annotator_id: string | number; text: string; [key: string]: string | number | boolean | null; }
export const validateMeasuringHateSpeech = (rows: readonly MeasuringHateSpeechRecord[]): void => {
  if (!rows.length) throw new Error("Measuring Hate Speech artifact is empty");
  const annotationIds: string[] = [];
  const texts = new Map<string, string>();
  rows.forEach((row) => {
    const commentId = String(row.comment_id); const annotatorId = String(row.annotator_id);
    if (!commentId.trim() || !annotatorId.trim() || !row.text.trim()) throw new Error("Measuring Hate Speech missing structural field");
    annotationIds.push(`${commentId}\u0000${annotatorId}`);
    const prior = texts.get(commentId);
    if (prior !== undefined && prior !== row.text) throw new Error(`Measuring Hate Speech text mismatch for comment ${commentId}`);
    texts.set(commentId, row.text);
  });
  unique(annotationIds, "Measuring Hate Speech annotations");
};
