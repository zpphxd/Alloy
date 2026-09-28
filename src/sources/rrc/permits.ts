/**
 * Texas Railroad Commission: the oil & gas stream (the Nova Compression play).
 *
 * Paul: "The Texas Railroad Commission lists everybody that's gonna drill a
 * well... sort it to those people that have between fifty and three hundred
 * wells. That's our sweet spot."
 *
 * RRC publishes drilling permits and well/operator data as bulk downloads
 * (rrc.texas.gov -> Resource Center -> Data Sets Available for Download).
 * Formats differ by data set (fixed-width, CSV, dBase), so this module takes
 * a normalized CSV export for now. Wiring a direct download is Phase 2.
 */
import { parseCsvRecords } from "../../lib/csv.ts";

export interface OperatorWellCount {
  operatorNumber: string;
  operatorName: string;
  activeWells: number;
  permitsLast12Months: number;
}

/** Parse a CSV with columns: operator_number,operator_name,active_wells,permits_12m */
export function parseOperatorCsv(csv: string): OperatorWellCount[] {
  const rows = parseCsvRecords(csv);
  for (const col of ["operator_number", "operator_name", "active_wells", "permits_12m"]) {
    if (rows[0] && !(col in rows[0])) throw new Error(`RRC CSV missing column "${col}"`);
  }
  return rows.map((r) => ({
    operatorNumber: r.operator_number!,
    operatorName: r.operator_name!,
    activeWells: Number(r.active_wells),
    permitsLast12Months: Number(r.permits_12m),
  }));
}

/** Paul's sweet spot: 50-300 wells. */
export function inSweetSpot(op: OperatorWellCount, min = 50, max = 300): boolean {
  return op.activeWells >= min && op.activeWells <= max;
}
