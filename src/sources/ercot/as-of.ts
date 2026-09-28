/**
 * Work out which month a GIS report describes from its file name, so back
 * reports can be loaded in any order and still sort correctly.
 *
 * ERCOT download names look like
 *   RPT.00015933.0000000000000000.20260902.100104506.GIS_Report_August2026.xlsx
 * A month name in the friendly part ("August2026", "Aug_2026") wins. The
 * YYYYMMDD publish-date segment is the fallback.
 */
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export function parseAsOf(fileName: string): string | null {
  const name = fileName.toLowerCase();
  const m = name.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s_.-]*((?:19|20)\d{2})/);
  if (m) {
    const month = MONTHS.indexOf(m[1]!) + 1;
    return `${m[2]}-${String(month).padStart(2, "0")}-01`;
  }
  const d = name.match(/(?:^|[._-])((?:19|20)\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?:[._-]|$)/);
  if (d) return `${d[1]}-${d[2]}-${d[3]}`;
  return null;
}
