import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { Project } from "../domain/types.ts";
import { FALLBACK_BETA, MODEL, assertNotRefused, claude } from "../lib/claude.ts";

/**
 * Step 4 of owner resolution: ask Claude, with web search, who is behind a
 * project SPV. Answers land in the review queue, and a person confirms them
 * before they go into the alias table.
 */

const OwnerFinding = z.object({
  owner_name: z.string().describe("Developer or sponsor that owns or controls the project; 'unknown' if not found"),
  parent_name: z.string().describe("Ultimate parent if different from owner, else empty string"),
  confidence: z.enum(["high", "medium", "low"]),
  evidence: z.string().describe("What the sources say, briefly"),
  source_urls: z.array(z.string()),
});
export type OwnerFindingT = z.infer<typeof OwnerFinding>;

const RECORD_TOOL: Anthropic.Beta.BetaTool = {
  name: "record_owner",
  description: "Record who owns the project once you've researched it. Call this exactly once, at the end.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      owner_name: { type: "string" },
      parent_name: { type: "string" },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
      evidence: { type: "string" },
      source_urls: { type: "array", items: { type: "string" } },
    },
    required: ["owner_name", "parent_name", "confidence", "evidence", "source_urls"],
    additionalProperties: false,
  },
};

export async function resolveOwnerWithWeb(p: Project): Promise<OwnerFindingT> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: "user",
      content: `Who is the developer or owner behind this ERCOT interconnection queue project?

Project: ${p.name}
Queue ID (INR): ${p.id}
Filing entity: ${p.interconnectingEntity ?? "unknown"}
Technology: ${p.technology}, ${p.capacityMw} MW
County: ${p.county ?? "unknown"}, Texas
Projected COD: ${p.projectedCod ?? "unknown"}

Search for the project and filing entity (press releases, county tax abatement filings, PUCT or ERCOT documents, developer websites). Then call record_owner. If you can't find it, record owner_name "unknown" with low confidence.`,
    },
  ];
  const tools: Anthropic.Beta.BetaToolUnion[] = [
    { type: "web_search_20260209", name: "web_search", max_uses: 6 },
    RECORD_TOOL,
  ];

  for (let turn = 0; turn < 5; turn++) {
    const msg = await claude().beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      output_config: { effort: "medium" },
      tools,
      messages,
    });
    assertNotRefused(msg);
    const call = msg.content.find((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use" && b.name === "record_owner");
    if (call) return OwnerFinding.parse(call.input);
    if (msg.stop_reason !== "pause_turn") break;
    // Server-side search loop paused; send the turn back and it resumes.
    messages.push({ role: "assistant", content: msg.content });
  }
  return { owner_name: "unknown", parent_name: "", confidence: "low", evidence: "No answer recorded", source_urls: [] };
}
