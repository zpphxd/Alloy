import { createHash } from "node:crypto";
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { Fly } from "../../config/flies.ts";
import { FALLBACK_BETA, MODEL, assertNotRefused, claude } from "../lib/claude.ts";
import { jevEngine } from "./jev-engine.ts";

/**
 * The yes/no qualifier. Zach wants a deterministic answer to "is this one
 * of our fish?" Four things make it deterministic in practice:
 *
 *  1. Hard numbers are decided in code (src/flies/match.ts) before any model
 *     sees the target.
 *  2. The engine answers each rubric criterion separately as a typed boolean
 *     (optionally with a probability), so there's no free text to parse.
 *  3. The final verdict is computed here from those answers (every required
 *     criterion met, above the probability floor), not taken from the engine.
 *  4. Answers are cached by a hash of (engine, fly rubric, dossier). The same
 *     target with the same facts never gets re-judged differently.
 *
 * Engines are swappable (see `engineFromEnv`): TypeSafe's Jev, a
 * non-generative "System One" model that returns typed yes/no answers with
 * probabilities (src/qualify/jev-engine.ts), or Claude.
 */

export interface CriterionAnswer {
  id: string;
  met: boolean;
  /** Engine's probability that the criterion is met, when it reports one (Jev does). */
  probability?: number;
  evidence: string;
}

export interface QualifierAnswer {
  criteria: CriterionAnswer[];
  disqualifiers: string[];
  summary: string;
}

export interface QualifierEngine {
  /** Stable id, part of the cache key: changing engine or model re-judges. */
  id: string;
  answer(fly: Fly, dossier: string): Promise<QualifierAnswer>;
}

export interface Qualification {
  cacheKey: string;
  flyId: string;
  ownerId: string;
  verdict: "yes" | "no";
  answer: QualifierAnswer;
  engine: string;
  decidedAt: string;
}

export interface QualificationCache {
  get(key: string): Qualification | undefined;
  set(q: Qualification): void;
}

/** A required criterion counts as met only at or above this probability. */
export const MIN_PROBABILITY = 0.7;

const ClaudeOutput = z.object({
  criteria: z.array(
    z.object({
      id: z.string(),
      met: z.boolean(),
      evidence: z.string().describe("Specific facts from the dossier that support the answer. Say 'insufficient information' if none."),
    }),
  ),
  disqualifiers: z.array(z.string()).describe("Anything that makes this a clear no regardless of the rubric (e.g. owned by a major, already sold)."),
  summary: z.string().describe("Two sentences a producer can read before a call."),
});

const SYSTEM = `You qualify prospects for a commercial insurance team that specializes in renewable energy, storage, and energy infrastructure risk (builder's risk, operating property/casualty, and tax credit insurance).

You are given one target company's dossier and a rubric. Answer every rubric criterion independently, using only the dossier. If the dossier doesn't establish a criterion, mark it not met and say "insufficient information". Do not guess, and do not use outside knowledge you can't tie to the dossier.`;

export const claudeEngine: QualifierEngine = {
  id: `claude:${MODEL}`,
  async answer(fly, dossier) {
    const rubric = fly.rubric.map((r) => `- [${r.id}]${r.required ? " (required)" : ""} ${r.question}`).join("\n");
    const msg = await claude().beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      // Opus 5.5 always thinks; low effort is enough for a rubric check.
      output_config: { effort: "low", format: betaZodOutputFormat(ClaudeOutput) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `<target_profile>\n${fly.name}\n${fly.description}\n</target_profile>\n\n<rubric>\n${rubric}\n</rubric>\n\n<dossier>\n${dossier}\n</dossier>\n\nAnswer each rubric criterion by its id.`,
        },
      ],
    });
    assertNotRefused(msg);
    if (!msg.parsed_output) throw new Error(`Qualifier returned no parseable output (stop_reason=${msg.stop_reason})`);
    return msg.parsed_output;
  },
};

/** PESCADORA_QUALIFIER selects the engine: "jev" (default, TypeSafe Jev) or "claude". */
export function engineFromEnv(): QualifierEngine {
  const which = process.env.PESCADORA_QUALIFIER ?? "jev";
  if (which === "jev") {
    if (!process.env.TYPESAFE_API_KEY?.trim()) {
      throw new Error("TYPESAFE_API_KEY is not set. Add it to .env, or set PESCADORA_QUALIFIER=claude.");
    }
    return jevEngine();
  }
  if (which === "claude") return claudeEngine;
  throw new Error(`Unknown PESCADORA_QUALIFIER "${which}" (use "jev" or "claude")`);
}

export function cacheKey(fly: Fly, dossier: string, engineId: string): string {
  return createHash("sha256").update(JSON.stringify([engineId, fly.id, fly.rubric, dossier])).digest("hex");
}

export function verdictFor(fly: Fly, answer: QualifierAnswer, minProbability = MIN_PROBABILITY): "yes" | "no" {
  const byId = new Map(answer.criteria.map((c) => [c.id, c]));
  const requiredMet = fly.rubric
    .filter((r) => r.required)
    .every((r) => {
      const a = byId.get(r.id);
      return a?.met === true && (a.probability === undefined || a.probability >= minProbability);
    });
  return requiredMet && answer.disqualifiers.length === 0 ? "yes" : "no";
}

export async function qualify(
  fly: Fly,
  ownerId: string,
  dossier: string,
  cache?: QualificationCache,
  engine: QualifierEngine = engineFromEnv(),
): Promise<Qualification> {
  const key = cacheKey(fly, dossier, engine.id);
  const hit = cache?.get(key);
  if (hit) return hit;

  const answer = await engine.answer(fly, dossier);
  const q: Qualification = {
    cacheKey: key,
    flyId: fly.id,
    ownerId,
    verdict: verdictFor(fly, answer),
    answer,
    engine: engine.id,
    decidedAt: new Date().toISOString(),
  };
  cache?.set(q);
  return q;
}
