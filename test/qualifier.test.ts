import { beforeEach, describe, expect, it, vi } from "vitest";
import { FLIES } from "../config/flies.ts";
import { Store } from "../src/store/db.ts";

const parse = vi.fn();
vi.mock("../src/lib/claude.ts", async (orig) => ({
  ...(await orig<typeof import("../src/lib/claude.ts")>()),
  claude: () => ({ beta: { messages: { parse } } }),
}));

const { qualify } = await import("../src/qualify/qualifier.ts");
const fly = FLIES.find((f) => f.id === "storage-platform")!;

function reply(met: Record<string, boolean>, disqualifiers: string[] = []) {
  return {
    model: "claude-opus-5-5",
    stop_reason: "end_turn",
    parsed_output: {
      criteria: Object.entries(met).map(([id, m]) => ({ id, met: m, evidence: "..." })),
      disqualifiers,
      summary: "test",
    },
  };
}

describe("qualifier", () => {
  beforeEach(() => parse.mockReset());

  it("computes the verdict from required criteria, not from the model", async () => {
    parse.mockResolvedValueOnce(reply({ independent: true, growing: true, complexity: false }));
    expect((await qualify(fly, "o1", "dossier A")).verdict).toBe("yes");

    parse.mockResolvedValueOnce(reply({ independent: true, growing: false, complexity: true }));
    expect((await qualify(fly, "o1", "dossier B")).verdict).toBe("no");

    parse.mockResolvedValueOnce(reply({ independent: true, growing: true }, ["acquired by a major in 2025"]));
    expect((await qualify(fly, "o1", "dossier C")).verdict).toBe("no");
  });

  it("returns the cached answer for identical input instead of re-asking", async () => {
    const store = new Store(":memory:");
    parse.mockResolvedValueOnce(reply({ independent: true, growing: true }));
    const first = await qualify(fly, "o2", "same dossier", store);
    const second = await qualify(fly, "o2", "same dossier", store);
    expect(parse).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it("uses structured output, low effort, and default fallbacks", async () => {
    parse.mockResolvedValueOnce(reply({ independent: true, growing: true }));
    await qualify(fly, "o3", "dossier D");
    const req = parse.mock.calls[0]![0];
    expect(req).toMatchObject({ model: "claude-opus-5-5", fallbacks: "default", betas: ["server-side-fallback-2026-07-01"] });
    expect(req.output_config.effort).toBe("low");
    expect(req.output_config.format).toBeDefined();
  });
});
