import { describe, expect, it } from "vitest";
import type { Project } from "../src/domain/types.ts";
import { parseCsv } from "../src/lib/csv.ts";
import { hunt } from "../src/pipeline/hunt.ts";
import { projectStem, resolveOwners } from "../src/resolve/owner-resolver.ts";
import { parseLinkedInConnections } from "../src/route/warm-path.ts";
import { parseCrmCsv } from "../src/screen/crm-screen.ts";
import { diffSnapshots } from "../src/triggers/diff.ts";

const NOW = new Date("2026-09-28T00:00:00Z");

function p(over: Partial<Project> & Pick<Project, "id" | "name">): Project {
  return {
    source: "ercot_gis",
    interconnectingEntity: `${over.name} LLC`,
    technology: "storage",
    capacityMw: 100,
    stage: "development",
    county: "Harris",
    state: "TX",
    projectedCod: null,
    iaSignedDate: null,
    financialSecurityDate: null,
    approvedForSyncDate: null,
    raw: {},
    ...over,
  };
}

describe("owner resolution", () => {
  it("strips project words to a shared stem", () => {
    expect(projectStem("Albatross Solar, LLC")).toBe("albatross");
    expect(projectStem("Albatross BESS LLC")).toBe("albatross");
    expect(projectStem("Spoken Solar II LLC")).toBe("spoken");
  });

  it("groups SPVs by stem and prefers the alias table", () => {
    const projects = [
      p({ id: "1", name: "Albatross Solar" }),
      p({ id: "2", name: "Albatross BESS" }),
      p({ id: "3", name: "Longbow Solar" }),
    ];
    const { resolutions } = resolveOwners(projects, [
      { match: "longbow", ownerId: "tokyo-gas", ownerName: "Tokyo Gas America", source: "paul" },
    ]);
    expect(resolutions[0]!.ownerId).toBe(resolutions[1]!.ownerId);
    expect(resolutions[2]).toMatchObject({ ownerId: "tokyo-gas", method: "alias" });
  });
});

describe("triggers", () => {
  it("fires on new filings, IA signed, financial security, owner change, COD window", () => {
    const prev = [p({ id: "A", name: "Alpha BESS" }), p({ id: "B", name: "Bravo Solar", projectedCod: "2028-12-01" })];
    const curr = [
      p({ id: "A", name: "Alpha BESS", iaSignedDate: "2026-09-01", financialSecurityDate: "2026-09-15", interconnectingEntity: "NewCo Storage LLC" }),
      p({ id: "B", name: "Bravo Solar", projectedCod: "2027-06-01" }),
      p({ id: "C", name: "Charlie BESS" }),
    ];
    const kinds = diffSnapshots(prev, curr, { now: NOW }).map((t) => `${t.projectId}:${t.kind}`);
    expect(kinds).toEqual(
      expect.arrayContaining(["A:ia_signed", "A:financial_security_posted", "A:owner_changed", "B:cod_moved", "B:cod_approaching", "C:new_filing"]),
    );
  });
});

describe("hunt", () => {
  // A storage platform in Paul's shape: ~600 MW operating, ~1.4 GW pipeline.
  const platform = [
    ...[1, 2, 3].map((i) => p({ id: `op${i}`, name: `Mesa ${i} BESS`, interconnectingEntity: "Mesquite Storage Partners LLC", capacityMw: 200, stage: "operational" })),
    ...[1, 2, 3, 4, 5, 6, 7].map((i) =>
      p({ id: `dev${i}`, name: `Mesa ${i + 3} BESS`, interconnectingEntity: "Mesquite Storage Partners LLC", capacityMw: 200, stage: i === 1 ? "construction" : "development", projectedCod: "2027-05-01" }),
    ),
  ];
  const major = [1, 2, 3, 4, 5].map((i) => p({ id: `bp${i}`, name: `Big ${i} BESS`, interconnectingEntity: "BP Wind and Solar LLC", capacityMw: 300, stage: i < 3 ? "operational" : "development" }));
  const tiny = [p({ id: "t1", name: "Tiny Solar", technology: "solar", capacityMw: 5 })];

  const connections = parseLinkedInConnections(
    [
      "Notes:",
      '"When exporting your connection data, you may notice..."',
      "",
      "First Name,Last Name,URL,Email Address,Company,Position,Connected On",
      'Dana,Reyes,https://linkedin.com/in/dana,,"Mesquite Storage Partners, LLC",Chief Financial Officer,01 Mar 2026',
    ].join("\n"),
    "paul",
  );

  it("finds the platform, excludes the major, and routes through Paul", () => {
    const r = hunt({ projects: [...platform, ...major, ...tiny], connections, now: NOW });
    expect(r.excluded.map((x) => x.term)).toContain("bp");
    expect(r.targets).toHaveLength(1);
    const t = r.targets[0]!;
    expect(t.owner.name).toBe("Mesquite Storage Partners LLC");
    expect(t.flies.map((f) => f.flyId)).toEqual(expect.arrayContaining(["storage-platform", "near-term-construction"]));
    expect(t.warmPath.paths[0]).toMatchObject({ firstName: "Dana", via: "paul", score: 5 });
    expect(t.economics.totalCommission).toBeGreaterThan(0);
  });

  it("flags accounts Baldwin or CAC already own", () => {
    const crm = parseCrmCsv("account_name,status,owner\nMesquite Storage Partners LLC,Client,Sandy", "cac");
    const r = hunt({ projects: platform, crm, now: NOW });
    expect(r.targets[0]!.screen.status).toBe("cac_account");
  });
});

describe("csv", () => {
  it("handles quoted commas and escaped quotes", () => {
    expect(parseCsv('a,"b, c","say ""hi"""\n1,2,3')).toEqual([["a", "b, c", 'say "hi"'], ["1", "2", "3"]]);
  });
});
