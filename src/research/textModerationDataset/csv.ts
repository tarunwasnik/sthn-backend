export type CsvRecord = Readonly<Record<string, string>>;

export const parseCsv = (input: string): readonly CsvRecord[] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell.length === 0) quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (quoted) throw new Error("Unterminated quoted CSV field");
  if (cell.length || row.length) { row.push(cell.replace(/\r$/, "")); rows.push(row); }
  if (rows.length < 2) throw new Error("CSV must include a header and at least one data row");
  const header = rows[0].map((value) => value.replace(/^\uFEFF/, ""));
  if (new Set(header).size !== header.length || header.some((value) => !value)) throw new Error("CSV header must be non-empty and unique");
  return rows.slice(1).filter((values) => values.some((value) => value !== "")).map((values, index) => {
    if (values.length !== header.length) throw new Error(`CSV row ${index + 2} has ${values.length} fields; expected ${header.length}`);
    return Object.fromEntries(header.map((name, column) => [name, values[column]]));
  });
};
