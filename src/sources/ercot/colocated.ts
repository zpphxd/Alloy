import ExcelJS from "exceljs";
import { readProjectSheet } from "./gis-report.ts";

/**
 * ERCOT co-located battery identification report. Paul pulled the August 2026
 * edition on the call: 884 projects (584 standalone, 288 with solar, 10 with
 * wind, 2 with something else).
 *
 * We haven't seen this file's layout yet, so the parser is deliberately
 * loose: any sheet with an "INR" header row is read, and the sheet name plus
 * any "co-located"/"type" column is kept as the category. Once Paul sends the
 * file, drop it in test/fixtures/ and tighten this against the real columns.
 */
export interface ColocatedEntry {
  inr: string;
  projectName: string | null;
  category: string;
  sheet: string;
  raw: Record<string, string | null>;
}

export async function parseColocatedReport(bytes: Buffer | ArrayBuffer): Promise<ColocatedEntry[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as ArrayBuffer);
  const out: ColocatedEntry[] = [];
  for (const ws of wb.worksheets) {
    let rows;
    try {
      rows = readProjectSheet(ws);
    } catch {
      continue; // cover sheets, notes, etc.
    }
    for (const rec of rows) {
      const raw: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(rec)) raw[k] = v == null ? null : String(v);
      const categoryKey = Object.keys(raw).find((k) => /co-?located|type|category/i.test(k));
      const nameKey = Object.keys(raw).find((k) => /project name/i.test(k));
      out.push({
        inr: raw.INR!,
        projectName: nameKey ? raw[nameKey] ?? null : null,
        category: (categoryKey && raw[categoryKey]) || ws.name,
        sheet: ws.name,
        raw,
      });
    }
  }
  return out;
}
