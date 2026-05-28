export type CsvParseResult = {
  headers: string[];
  rows: string[][];
};

export const parseCsv = (input: string): CsvParseResult => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    const nextCharacter = input[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        field += '"';
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (character === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      row.push(field);
      if (row.some((value) => value.trim() !== "")) {
        rows.push(row);
      }
      row = [];
      field = "";
      continue;
    }

    field += character;
  }

  row.push(field);
  if (row.some((value) => value.trim() !== "")) {
    rows.push(row);
  }

  const [headers = [], ...bodyRows] = rows;

  return {
    headers: headers.map((header) => header.trim()),
    rows: bodyRows.map((bodyRow) => bodyRow.map((value) => value.trim())),
  };
};

export const stringifyCsv = (headers: string[], rows: string[][]): string => {
  const escapeValue = (value: string | undefined | null) => {
    if (value === null || value === undefined) {
      return "";
    }
    const stringValue = String(value);
    if (
      stringValue.includes('"') ||
      stringValue.includes(",") ||
      stringValue.includes("\n") ||
      stringValue.includes("\r")
    ) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  };

  const headerRow = headers.map(escapeValue).join(",");
  const bodyRows = rows.map((row) => row.map(escapeValue).join(","));

  return [headerRow, ...bodyRows].join("\n");
};