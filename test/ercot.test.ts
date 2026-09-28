import { describe, expect, it } from "vitest";
import { classifyTechnology, parseGisReport } from "../src/sources/ercot/gis-report.ts";
import { buildGisWorkbook } from "./fixtures/gis-workbook.ts";

describe("ERCOT GIS report parser", () => {
  it("finds the header row, recovers merged headers, and derives stage", async () => {
    const bytes = await buildGisWorkbook([
      { inr: "26INR0001", name: "Albatross Solar", entity: "Albatross Solar LLC", cod: "2027-06-01", county: "Pecos", mw: 300, fuel: "SOL", tech: "PV", ia: "2026-01-15" },
      { inr: "26INR0002", name: "Albatross BESS", entity: "Albatross BESS LLC", cod: "2027-06-01", county: "Pecos", mw: 150, fuel: "OTH", tech: "BA", ia: "2026-01-15", fs: "2026-07-01" },
      { inr: "22INR0003", name: "Old Wind", entity: "Old Wind LP", cod: "2023-01-01", county: "Nolan", mw: 200, fuel: "WIN", tech: "WT", ia: "2021-01-01", fs: "2021-06-01", sync: "2022-12-01" },
      { inr: "26INR0004", name: "Fresh Filing Solar", entity: "Fresh Filing Solar LLC", cod: null, county: "Webb", mw: 250, fuel: "SOL", tech: "PV" },
    ]);
    const projects = await parseGisReport(bytes);
    expect(projects).toHaveLength(4);

    const [solar, bess, wind, fresh] = projects;
    expect(solar).toMatchObject({ id: "26INR0001", technology: "solar", stage: "late_development", capacityMw: 300, projectedCod: "2027-06-01", county: "Pecos" });
    expect(bess).toMatchObject({ technology: "storage", stage: "construction", financialSecurityDate: "2026-07-01" });
    expect(wind).toMatchObject({ technology: "wind", stage: "operational" });
    expect(fresh).toMatchObject({ stage: "development", projectedCod: null });
  });

  it("classifies hybrids and storage by name", () => {
    expect(classifyTechnology("SOL", "BA", "Gemini Solar + Storage")).toBe("solar+storage");
    expect(classifyTechnology("OTH", "OT", "Eighteen Alpha BESS")).toBe("storage");
    expect(classifyTechnology("GAS", "CC", "Some Peaker")).toBe("gas");
  });
});
