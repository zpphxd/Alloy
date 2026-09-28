import ExcelJS from "exceljs";
import type { Project, Stage, Technology } from "../../domain/types.ts";

/**
 * ERCOT Generation Interconnection Status (GIS) report, data product PG7-200-ER.
 *
 * Paul's point on the call: ERCOT lists every project that has filed for an
 * interconnection. The filing is the first thing a developer does, so it's
 * the earliest public signal a project exists. The report is published
 * monthly as an .xlsx and reports type id 15933 on ERCOT's MIS.
 *
 * Layout notes (from how the open-source gridstatus parser reads it):
 *  - Project sheets are "Project Details - Large Gen" and
 *    "Project Details - Small Gen".
 *  - The header row isn't fixed; scan for the row containing "INR".
 *  - Some headers are merged cells whose text sits in the rows *below* the
 *    header; data rows are the ones with an INR value.
 *  - Fuel and Technology are coded (SOL/PV, OTH/BA, WIN/WT, GAS/CC ...).
 */

export const GIS_REPORT_TYPE_ID = 15933;
const MIS_BASE = "https://www.ercot.com";
export const PROJECT_SHEETS = ["Project Details - Large Gen", "Project Details - Small Gen"] as const;

interface MisDocument {
  docId: string;
  constructedName: string;
  friendlyName: string;
  publishDate: string;
  url: string;
}

/** List the documents ERCOT has published for a report type, newest first. */
export async function listMisDocuments(reportTypeId: number): Promise<MisDocument[]> {
  const res = await fetch(`${MIS_BASE}/misapp/servlets/IceDocListJsonWS?reportTypeId=${reportTypeId}&_=${Date.now()}`, {
    headers: { "User-Agent": "pescadora/0.1 (research)" },
  });
  if (!res.ok) throw new Error(`ERCOT MIS list failed: ${res.status} ${res.statusText}`);
  const body = (await res.json()) as {
    ListDocsByRptTypeRes: { DocumentList: Array<{ Document: Record<string, string> }> };
  };
  return body.ListDocsByRptTypeRes.DocumentList.map(({ Document: d }) => ({
    docId: String(d.DocID),
    constructedName: String(d.ConstructedName),
    friendlyName: String(d.FriendlyName),
    publishDate: String(d.PublishDate),
    url: `${MIS_BASE}/misdownload/servlets/mirDownload?doclookupId=${d.DocID}`,
  })).sort((a, b) => b.publishDate.localeCompare(a.publishDate));
}

/**
 * Download the newest document whose constructed name contains `nameContains`.
 * "GIS_Report" is the main queue; the co-located battery report is published
 * alongside it (check `listMisDocuments` output for its exact name).
 */
export async function downloadLatest(reportTypeId: number, nameContains: string): Promise<{ doc: MisDocument; bytes: Buffer }> {
  const docs = await listMisDocuments(reportTypeId);
  const doc = docs.find((d) => d.constructedName.includes(nameContains));
  if (!doc) throw new Error(`No ERCOT document matching "${nameContains}" for report type ${reportTypeId}`);
  const res = await fetch(doc.url, { headers: { "User-Agent": "pescadora/0.1 (research)" } });
  if (!res.ok) throw new Error(`ERCOT download failed: ${res.status} ${res.statusText}`);
  return { doc, bytes: Buffer.from(await res.arrayBuffer()) };
}

const FUEL: Record<string, string> = {
  BIO: "biomass", COA: "coal", GAS: "gas", GEO: "geothermal", HYD: "hydrogen", NUC: "nuclear",
  OIL: "oil", OTH: "other", PET: "petcoke", SOL: "solar", WAT: "water", WIN: "wind",
};

export function classifyTechnology(fuel: string | null, tech: string | null, name: string): Technology {
  const f = (fuel ?? "").trim().toUpperCase();
  const t = (tech ?? "").trim().toUpperCase();
  if (t === "BA" || t === "EN" || /\b(BESS|STORAGE|ESS)\b/i.test(name)) {
    // Storage filed under a solar or wind INR shows up as a hybrid.
    if (f === "SOL") return "solar+storage";
    if (f === "WIN") return "wind+storage";
    return "storage";
  }
  if (f === "SOL" || t === "PV") return "solar";
  if (f === "WIN" || t === "WT") return "wind";
  if (f === "GAS") return "gas";
  return "other";
}

/**
 * Map queue milestones to our lifecycle stage. The milestone columns are
 * dates (or blank), so a filled cell means the milestone happened.
 */
export function deriveStage(m: {
  iaSigned: string | null;
  financialSecurity: string | null;
  approvedForSync: string | null;
}): Stage {
  if (m.approvedForSync) return "operational";
  if (m.financialSecurity) return "construction";
  if (m.iaSigned) return "late_development";
  return "development";
}

type Cell = ExcelJS.CellValue;

function cellText(v: Cell): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("result" in v && v.result !== undefined) return cellText(v.result as Cell);
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("text" in v) return String(v.text);
    return null;
  }
  const s = String(v).trim();
  return s === "" ? null : s;
}

/** Excel dates arrive as Date, ISO-ish strings, or serial numbers. */
function cellDate(v: Cell): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 20000 && v < 80000) {
    return new Date(Date.UTC(1899, 11, 30) + v * 86_400_000).toISOString().slice(0, 10);
  }
  const s = cellText(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/** Queue IDs look like "24INR0123". Anything else in that column is a footnote or sub-header. */
const INR_PATTERN = /^\d{2}INR\d{4}[A-Z]?$/i;
const isInr = (v: Cell) => INR_PATTERN.test(cellText(v) ?? "");

/** Read one project sheet into header -> value records (data rows only). */
export function readProjectSheet(ws: ExcelJS.Worksheet): Array<Record<string, Cell>> {
  let headerRow = -1;
  for (let r = 1; r <= Math.min(ws.rowCount, 60); r++) {
    const row = ws.getRow(r);
    let found = false;
    row.eachCell((c) => { if (cellText(c.value) === "INR") found = true; });
    if (found) { headerRow = r; break; }
  }
  if (headerRow < 0) throw new Error(`No INR header row in sheet "${ws.name}"`);

  // Column labels: the header cell, or for merged headers the text fragments
  // stacked in the sub-header rows before the first data row.
  const labels = new Map<number, string>();
  const header = ws.getRow(headerRow);
  const inrCol = (() => {
    let col = -1;
    header.eachCell((c, n) => { if (cellText(c.value) === "INR") col = n; });
    return col;
  })();
  let firstData = headerRow + 1;
  while (firstData <= ws.rowCount && !isInr(ws.getRow(firstData).getCell(inrCol).value)) firstData++;

  const width = Math.max(header.cellCount, ws.columnCount);
  for (let c = 1; c <= width; c++) {
    let label = cellText(header.getCell(c).value);
    if (!label) {
      const parts: string[] = [];
      for (let r = headerRow + 1; r < firstData; r++) {
        const t = cellText(ws.getRow(r).getCell(c).value);
        if (t) parts.push(t);
      }
      label = parts.join(" ") || null;
    }
    if (label) labels.set(c, label.replace(/\s+/g, " ").trim());
  }

  const out: Array<Record<string, Cell>> = [];
  for (let r = firstData; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    if (!isInr(row.getCell(inrCol).value)) continue;
    const rec: Record<string, Cell> = {};
    for (const [c, label] of labels) rec[label] = row.getCell(c).value;
    out.push(rec);
  }
  return out;
}

/** Look a field up by any of several header spellings (ERCOT renames columns). */
function pick(rec: Record<string, Cell>, ...names: string[]): Cell {
  const keys = Object.keys(rec);
  for (const n of names) {
    const k = keys.find((key) => norm(key) === norm(n)) ?? keys.find((key) => norm(key).startsWith(norm(n)));
    if (k !== undefined) return rec[k] ?? null;
  }
  return null;
}

export function toProject(rec: Record<string, Cell>): Project {
  const name = cellText(pick(rec, "Project Name")) ?? "";
  const fuel = cellText(pick(rec, "Fuel"));
  const tech = cellText(pick(rec, "Technology"));
  const iaSigned = cellDate(pick(rec, "IA Signed"));
  const financialSecurity = cellDate(pick(rec, "Financial Security and Notice to Proceed Provided", "Financial Security"));
  const approvedForSync = cellDate(pick(rec, "Approved for Synchronization"));
  const raw: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rec)) raw[k] = cellText(v);
  if (fuel) raw.FuelDecoded = FUEL[fuel.toUpperCase()] ?? fuel;
  return {
    id: cellText(pick(rec, "INR"))!,
    source: "ercot_gis",
    name,
    interconnectingEntity: cellText(pick(rec, "Interconnecting Entity")),
    technology: classifyTechnology(fuel, tech, name),
    capacityMw: Number(cellText(pick(rec, "Capacity (MW)", "Capacity", "MW")) ?? 0) || 0,
    stage: deriveStage({ iaSigned, financialSecurity, approvedForSync }),
    county: cellText(pick(rec, "County")),
    state: "TX",
    projectedCod: cellDate(pick(rec, "Projected COD")),
    iaSignedDate: iaSigned,
    financialSecurityDate: financialSecurity,
    approvedForSyncDate: approvedForSync,
    raw,
  };
}

/** Parse a GIS report workbook (downloaded or dropped in by hand). */
export async function parseGisReport(bytes: Buffer | ArrayBuffer): Promise<Project[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as ArrayBuffer);
  const projects: Project[] = [];
  for (const sheetName of PROJECT_SHEETS) {
    const ws = wb.getWorksheet(sheetName);
    if (!ws) continue;
    for (const rec of readProjectSheet(ws)) projects.push(toProject(rec));
  }
  if (projects.length === 0) {
    throw new Error(`No project rows found. Sheets present: ${wb.worksheets.map((w) => w.name).join(", ")}`);
  }
  return projects;
}
