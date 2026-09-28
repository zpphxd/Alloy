import ExcelJS from "exceljs";

/**
 * Builds a small workbook shaped like ERCOT's GIS report: title rows above
 * the header, a merged "Financial Security..." header whose text sits in the
 * sub-header row, coded Fuel/Technology, and a blank spacer row.
 */
export interface FixtureRow {
  inr: string;
  name: string;
  entity: string;
  cod: string | null;
  county: string;
  mw: number;
  fuel: string;
  tech: string;
  ia?: string | null;
  fs?: string | null;
  sync?: string | null;
}

export async function buildGisWorkbook(rows: FixtureRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Project Details - Large Gen");
  ws.addRow(["ERCOT Generation Interconnection Status Report"]);
  ws.addRow(["Report date: 08/31/2026"]);
  ws.addRow([]);
  ws.addRow([
    "INR", "Project Name", "Interconnecting Entity", "Projected COD", "County", "Capacity (MW)",
    "Fuel", "Technology", "IA Signed", null, "Approved for Synchronization",
  ]);
  // Sub-header row: the merged header's text lands here, under column J.
  ws.addRow([null, null, null, null, null, null, null, null, null, "Financial Security and Notice to Proceed Provided", null]);
  const d = (s: string | null | undefined) => (s ? new Date(`${s}T00:00:00Z`) : null);
  for (const r of rows) {
    ws.addRow([r.inr, r.name, r.entity, d(r.cod), r.county, r.mw, r.fuel, r.tech, d(r.ia), d(r.fs), d(r.sync)]);
  }
  ws.addRow([]);
  ws.addRow(["* Notes: capacities are summer net MW"]);
  wb.addWorksheet("Summary").addRow(["not a project sheet"]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
