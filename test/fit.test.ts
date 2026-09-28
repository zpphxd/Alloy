import { describe, expect, it } from "vitest";
import type { Project } from "../src/domain/types.ts";
import { fitSeeds } from "../src/fit/seed-fit.ts";
import { hunt } from "../src/pipeline/hunt.ts";
import { parseAsOf } from "../src/sources/ercot/as-of.ts";
import type { Snapshot } from "../src/store/db.ts";

function p(over: Partial<Project> & Pick<Project, "id" | "name">): Project {
  return {
    source: "ercot_gis", interconnectingEntity: `${over.name} LLC`, technology: "solar", capacityMw: 200,
    stage: "development", county: "Pecos", state: "TX", projectedCod: null, iaSignedDate: null,
    financialSecurityDate: null, approvedForSyncDate: null, raw: {}, ...over,
  };
}

describe("parseAsOf", () => {
  it("reads the report month, falling back to the publish date", () => {
    expect(parseAsOf("RPT.00015933.0000000000000000.20260902.100104506.GIS_Report_August2026.xlsx")).toBe("2026-08-01");
    expect(parseAsOf("GIS_Report_Sep_2024.xlsx")).toBe("2024-09-01");
    expect(parseAsOf("RPT.00015933.0000000000000000.20240603.101500123.xlsx")).toBe("2024-06-03");
    expect(parseAsOf("report.xlsx")).toBeNull();
  });
});

describe("fitSeeds", () => {
  // Nightpeak-shaped history: 2 projects in 2024, 6 by 2026.
  const snaps: Snapshot[] = [
    { id: 1, label: "a", asOf: "2024-08-01", projects: [
      p({ id: "1", name: "Ash Creek Solar", interconnectingEntity: "Nightpeak Energy LLC", capacityMw: 300 }),
      p({ id: "2", name: "Ridge BESS", interconnectingEntity: "Nightpeak Energy LLC", technology: "storage", capacityMw: 150 }),
      p({ id: "9", name: "Other Solar", interconnectingEntity: "Some Dev LLC", capacityMw: 250 }),
    ] },
    { id: 2, label: "b", asOf: "2026-08-01", projects: [
      p({ id: "1", name: "Ash Creek Solar", interconnectingEntity: "Nightpeak Energy LLC", capacityMw: 300, iaSignedDate: "2025-02-01", financialSecurityDate: "2025-08-01", stage: "construction" }),
      p({ id: "2", name: "Ridge BESS", interconnectingEntity: "Nightpeak Energy LLC", technology: "storage", capacityMw: 150, stage: "operational", approvedForSyncDate: "2026-01-01" }),
      ...[3, 4, 5, 6].map((i) => p({ id: `${i}`, name: `Mesa ${i} Solar`, interconnectingEntity: "Nightpeak Energy LLC", capacityMw: 250 })),
      // A company today shaped like Nightpeak two years ago.
      p({ id: "20", name: "Cedar Solar", interconnectingEntity: "Upstart Renewables LLC", capacityMw: 280 }),
      p({ id: "21", name: "Cedar BESS", interconnectingEntity: "Upstart Renewables LLC", technology: "storage", capacityMw: 120 }),
    ] },
  ];

  const fit = fitSeeds(snaps, { companies: ["Nightpeak Energy", "Avantus"], projects: ["Ash Creek", "Gemini"] });

  it("reads each seed's shape at the lookback point", () => {
    const n = fit.atLookback.find((a) => a.seed === "Nightpeak Energy")!.point!;
    expect(n).toMatchObject({ asOf: "2024-08-01", projectCount: 2, mwPipeline: 450, mwOperational: 0 });
    expect(fit.companies[0]!.points).toHaveLength(2);
  });

  it("profiles seed projects' milestone timing", () => {
    const ash = fit.projects.find((x) => x.seed === "Ash Creek")!;
    expect(ash).toMatchObject({ projectId: "1", firstSeen: "2024-08-01", monthsToIa: 6, monthsToFinancialSecurity: 12 });
  });

  it("notes seeds it can't find", () => {
    expect(fit.notes.join(" ")).toMatch(/Avantus/);
    expect(fit.notes.join(" ")).toMatch(/Gemini/);
  });

  it("proposes a fly that finds today's lookalikes", () => {
    expect(fit.proposedFly!.gates).toMatchObject({ minProjects: 2, maxProjects: 3, minMwPipeline: 225 });
    const r = hunt({ projects: snaps[1]!.projects, flies: [fit.proposedFly!], now: new Date("2026-09-28") });
    expect(r.targets.map((t) => t.owner.name)).toContain("Upstart Renewables LLC");
    expect(r.targets.map((t) => t.owner.name)).not.toContain("Nightpeak Energy LLC");
  });
});
