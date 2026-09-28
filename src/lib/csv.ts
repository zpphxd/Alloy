/** Minimal RFC 4180 CSV parser: quoted fields, escaped quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      rows.push(row); row = [];
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

/**
 * Parse into objects keyed by header. `headerMatch` finds the header row when
 * the file has preamble lines (LinkedIn's export starts with notes).
 */
export function parseCsvRecords(text: string, headerMatch?: (row: string[]) => boolean): Record<string, string>[] {
  const rows = parseCsv(text);
  const h = headerMatch ? rows.findIndex(headerMatch) : 0;
  if (h < 0 || !rows[h]) return [];
  const header = rows[h]!.map((c) => c.trim().toLowerCase());
  return rows.slice(h + 1).map((r) => Object.fromEntries(header.map((c, i) => [c, (r[i] ?? "").trim()])));
}
