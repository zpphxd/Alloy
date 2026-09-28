import { describe, expect, it } from "vitest";
import { estimatePortfolio, estimateProject } from "../src/economics/estimate.ts";

// Each case is a worked example Paul gave on the 2026-09-28 call.
describe("economics: Paul's worked examples", () => {
  it("200 MW operating solar -> ~$2.4M premium, ~$240k commission", () => {
    const e = estimateProject({ technology: "solar", capacityMw: 200, stage: "operational" });
    expect(e.pcPremium).toBe(2_400_000);
    expect(e.pcCommission).toBe(240_000);
    expect(e.taxCommission).toBe(0);
  });

  it("600 MW solar in construction -> $3M premium, ~$300M tax limit, ~$585k to producer", () => {
    const e = estimateProject({ technology: "solar", capacityMw: 600, stage: "construction" });
    expect(e.pcPremium).toBe(3_000_000);
    expect(e.taxLimit).toBe(300_000_000);
    expect(e.taxCommission).toBe(3_000_000);
    expect(e.producerComp).toBeCloseTo(135_000 + 450_000);
  });

  it("100 MW storage -> ~$1M premium ($100k) and a $50M tax policy ($500k)", () => {
    const e = estimateProject({ technology: "storage", capacityMw: 100, stage: "construction" });
    expect(e.pcPremium).toBe(1_000_000);
    expect(e.pcCommission).toBe(100_000);
    expect(e.taxLimit).toBe(50_000_000);
    expect(e.taxCommission).toBe(500_000);
  });

  it("no tax policy for gas plants", () => {
    const e = estimateProject({ technology: "gas", capacityMw: 500, stage: "construction" });
    expect(e.taxCommission).toBe(0);
  });

  it("portfolio skips withdrawn projects", () => {
    const e = estimatePortfolio([
      { technology: "solar", capacityMw: 200, stage: "operational" },
      { technology: "solar", capacityMw: 999, stage: "withdrawn" },
    ]);
    expect(e.pcCommission).toBe(240_000);
  });
});
