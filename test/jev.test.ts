import { describe, expect, it } from "vitest";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { FLIES } from "../config/flies.ts";
import type { Project } from "../src/domain/types.ts";
import { scoreLookalikes } from "../src/fit/jev-lookalike.ts";
import { fitSeeds } from "../src/fit/seed-fit.ts";
import { hunt } from "../src/pipeline/hunt.ts";
import { jevEngine } from "../src/qualify/jev-engine.ts";
import { qualify } from "../src/qualify/qualifier.ts";

/** A real SDK client whose HTTP layer is a stub: no network, no key. */
function stubClient(answer: (body: { questions: Record<string, { type: string }> }) => Record<string, unknown>) {
  const calls: Array<{ url: string; body: any; auth: string | null }> = [];
  const client = new TypeSafeClient({
    apiKey: "test-key",
    retry: { maxRetries: 0 },
    fetch: async (url, init) => {
      const body = JSON.parse(String(init?.body));
      calls.push({ url, body, auth: new Headers(init?.headers).get("authorization") });
      return new Response(JSON.stringify({ model: "jev-test", answers: answer(body), usage: { input_tokens: 10, output_tokens: 3 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  return { client, calls };
}

const fly = FLIES.find((f) => f.id === "storage-platform")!;

describe("Jev qualifier engine", () => {
  it("asks one yes/no per rubric item plus the major check, and maps probabilities", async () => {
    const { client, calls } = stubClient(() => ({
      independent: { type: "noul", noul: 0.92 },
      growing: { type: "noul", noul: 0.81 },
      complexity: { type: "noul", noul: 0.3 },
      disqualifier_major: { type: "noul", noul: 0.05 },
    }));
    const q = await qualify(fly, "o1", "Owner: Mesquite Storage Partners", undefined, jevEngine(client));

    expect(calls[0]!.url).toBe("https://api.typesafe.ai/v1/systemone");
    expect(calls[0]!.auth).toBe("Bearer test-key");
    expect(Object.keys(calls[0]!.body.questions)).toEqual(["independent", "growing", "complexity", "disqualifier_major"]);
    expect(calls[0]!.body.questions.independent.type).toBe("noul");
    expect(calls[0]!.body.state.dossier).toContain("Mesquite");
    expect(calls[0]!.body.model).toBe("jev-latest");

    expect(q.verdict).toBe("yes");
    expect(q.engine).toBe("jev:jev-latest");
    expect(q.answer.criteria.find((c) => c.id === "complexity")).toMatchObject({ met: false, probability: 0.3 });
  });

  it("says no when a required answer is below the probability floor", async () => {
    const { client } = stubClient(() => ({
      independent: { type: "noul", noul: 0.95 },
      growing: { type: "noul", noul: 0.62 },
      complexity: { type: "noul", noul: 0.9 },
      disqualifier_major: { type: "noul", noul: 0.1 },
    }));
    expect((await qualify(fly, "o2", "d", undefined, jevEngine(client))).verdict).toBe("no");
  });

  it("disqualifies likely majors", async () => {
    const { client } = stubClient(() => ({
      independent: { type: "noul", noul: 0.9 },
      growing: { type: "noul", noul: 0.9 },
      complexity: { type: "noul", noul: 0.9 },
      disqualifier_major: { type: "noul", noul: 0.88 },
    }));
    const q = await qualify(fly, "o3", "d", undefined, jevEngine(client));
    expect(q.verdict).toBe("no");
    expect(q.answer.disqualifiers[0]).toMatch(/major/);
  });
});

describe("Jev lookalike ranking", () => {
  const p = (over: Partial<Project> & Pick<Project, "id" | "name">): Project => ({
    source: "ercot_gis", interconnectingEntity: `${over.name} LLC`, technology: "solar", capacityMw: 250, stage: "development",
    county: "Pecos", state: "TX", projectedCod: null, iaSignedDate: null, financialSecurityDate: null, approvedForSyncDate: null,
    raw: {}, ...over,
  });
  const snaps = [
    { id: 1, label: "a", asOf: "2024-08-01", projects: [
      p({ id: "1", name: "Ash Creek Solar", interconnectingEntity: "Nightpeak Energy LLC", capacityMw: 300 }),
      p({ id: "2", name: "Ridge BESS", interconnectingEntity: "Nightpeak Energy LLC", technology: "storage" as const, capacityMw: 150 }),
    ] },
    { id: 2, label: "b", asOf: "2026-08-01", projects: [
      p({ id: "20", name: "Cedar Solar", interconnectingEntity: "Upstart Renewables LLC", capacityMw: 280 }),
      p({ id: "21", name: "Cedar BESS", interconnectingEntity: "Upstart Renewables LLC", technology: "storage" as const, capacityMw: 120 }),
      p({ id: "30", name: "Oak Solar", interconnectingEntity: "Middling Power LLC", capacityMw: 300 }),
      p({ id: "31", name: "Oak Two Solar", interconnectingEntity: "Middling Power LLC", capacityMw: 300 }),
    ] },
  ];

  it("scores each match against the seeds and sorts by resemblance", async () => {
    const fit = fitSeeds(snaps, { companies: ["Nightpeak Energy"], projects: [] });
    const matches = hunt({ projects: snaps[1]!.projects, flies: [fit.proposedFly!], now: new Date("2026-09-28") });
    expect(matches.targets.length).toBe(2);

    const { client, calls } = stubClient((body) => {
      const upstart = JSON.stringify(body).includes("Upstart");
      return {
        resemblance: { type: "score", score: upstart ? 3.4 : 1.8, confidence: 0.8, legend: {}, probabilities: {} },
        early_growth: { type: "noul", noul: 0.9 },
        independent: { type: "noul", noul: 0.95 },
      };
    });
    const ranked = await scoreLookalikes(matches.targets, fit, client);

    expect(calls[0]!.body.questions.resemblance).toMatchObject({ type: "score" });
    expect(calls[0]!.body.questions.resemblance.criteria).toHaveLength(5);
    expect(calls[0]!.body.state.seed_companies_at_lookback[0]).toMatchObject({ seed: "Nightpeak Energy", as_of: "2024-08-01", projects: 2 });
    expect(ranked.map((r) => r.ownerName)).toEqual(["Upstart Renewables LLC", "Middling Power LLC"]);
    expect(ranked[0]!.resemblance).toBe(3.4);
  });
});
