import fs from "node:fs";

export type MutableCsvRecord = Record<string, string>;

export async function* streamCsv(filename: string): AsyncGenerator<MutableCsvRecord> {
  const input = fs.createReadStream(filename, { encoding: "utf8" });
  let header: string[] | null = null; let row: string[] = []; let cell = ""; let quoted = false; let quotePending = false; let rowNumber = 0;
  const emit = (): MutableCsvRecord | null => {
    row.push(cell.replace(/\r$/, "")); cell = ""; rowNumber += 1;
    if (!header) {
      header = row.map((value) => value.replace(/^\uFEFF/, "")); row = [];
      if (!header.length || header.some((value) => !value) || new Set(header).size !== header.length) throw new Error("CSV header must be non-empty and unique");
      return null;
    }
    if (row.length !== header.length) throw new Error(`CSV row ${rowNumber} has ${row.length} fields; expected ${header.length}`);
    const record = Object.fromEntries(header.map((name, index) => [name, row[index]])); row = []; return record;
  };
  for await (const chunk of input) {
    let index = 0;
    if (quotePending) {
      if (chunk[0] === '"') { cell += '"'; index = 1; } else quoted = false;
      quotePending = false;
    }
    for (; index < chunk.length; index += 1) {
      const char = chunk[index];
      if (quoted) {
        if (char === '"') {
          if (index + 1 >= chunk.length) quotePending = true;
          else if (chunk[index + 1] === '"') { cell += '"'; index += 1; } else quoted = false;
        } else cell += char;
      } else if (char === '"' && cell.length === 0) quoted = true;
      else if (char === ",") { row.push(cell); cell = ""; }
      else if (char === "\n") { const record = emit(); if (record && Object.values(record).some((value) => value !== "")) yield record; }
      else cell += char;
    }
  }
  if (quotePending) { quoted = false; quotePending = false; }
  if (quoted) throw new Error("Unterminated quoted CSV field");
  if (cell.length || row.length) { const record = emit(); if (record && Object.values(record).some((value) => value !== "")) yield record; }
  if (!header || rowNumber < 2) throw new Error("CSV must include a header and at least one data row");
}
