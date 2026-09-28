import { createHash } from "node:crypto";
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { Fly } from "../../config/flies.ts";
import { FALLBACK_BETA, MODEL, assertNotRefused, claude } from "../lib/claude.ts";

/**
 * The yes/no qualifier. Zach wants a deterministic answer to "is this one
 * of our fish?" Four things make it deterministic in practice:
 *
 *  1. Hard numbers are decided in code (src/flies/match.ts) before a model
 *     ever sees the target.
 *  2. The model answers each rubric criterion separately, as a boolean with
 *     evidence, through a schema-constrained response (structured outputs),
 *     so there's no free text to parse.
 *  3. The final verdict is computed here from those booleans (every required
 *     criterion met), not taken from the model.
 *  4. Answers are cached by a hash of (model, fly rubric, dossier). The same
 *     target with the same facts never gets re-judged differently. Only new
 *     facts produce a new answer.
 */

const CriterionAnswer = z.object({
  id: z.string(),
  met: z.boolean(),
  evidence: z.string().describe("Specific facts from the dossier that support the answer. Say 'insufficient information' if none."),
});

const QualifierOutput = z.object({
  criteria: z.array(CriterionAnswer),
  disqualifiers: z.array(z.string()).describe("Anything that makes this a clear no regardless of the rubric (e.g. owned by a major, already sold)."),
  summary: z.string().describe("Two sentences a producer can read before a call."),
});

export type QualifierAnswer = z.infer<typeof QualifierOutput>;

export interface Qualification {
  cacheKey: string;
  flyId: string;
  ownerId: string;
  verdict: "yes" | "no";
  answer: QualifierAnswer;
  model: string;
  decidedAt: string;
}

export interface QualificationCache {
  get(key: string): Qualification | undefined;
  set(q: Qualification): void;
}

const SYSTEM = `You qualify prospects for a commercial insurance team that specializes in renewable energy, storage, and energy infrastructure risk (builder's risk, operating property/casualty, and tax credit insurance).

You are given one target company's dossier and a rubric. Answer every rubric criterion independently, using only the dossier. If the dossier doesn't establish a criterion, mark it not met and say "insufficient information". Do not guess, and do not use outside knowledge you can't tie to the dossier.`;

export function cacheKey(fly: Fly, dossier: string, model = MODEL): string {
  return createHash("sha256").update(JSON.stringify([model, fly.id, fly.rubric, dossier])).digest("hex");
}

export async function qualify(
  fly: Fly,
  ownerId: string,
  dossier: string,
  cache?: QualificationCache,
): Promise<Qualification> {
  const key = cacheKey(fly, dossier);
  const hit = cache?.get(key);
  if (hit) return hit;

  const rubric = fly.rubric.map((r) => `- [${r.id}]${r.required ? " (required)" : ""} ${r.question}`).join("\n");
  const msg = await claude().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    // Opus 5.5 always thinks; low effort is enough for a rubric check.
    output_config: { effort: "low", format: betaZodOutputFormat(QualifierOutput) },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `<target_profile>\n${fly.name}\n${fly.description}\n</target_profile>\n\n<rubric>\n${rubric}\n</rubric>\n\n<dossier>\n${dossier}\n</dossier>\n\nAnswer each rubric criterion by its id.`,
      },
    ],
  });
  assertNotRefused(msg);
  const answer = msg.parsed_output;
  if (!answer) throw new Error(`Qualifier returned no parseable output (stop_reason=${msg.stop_reason})`);

  const byId = new Map(answer.criteria.map((c) => [c.id, c]));
  const requiredMet = fly.rubric.filter((r) => r.required).every((r) => byId.get(r.id)?.met === true);
  const q: Qualification = {
    cacheKey: key,
    flyId: fly.id,
    ownerId,
    verdict: requiredMet && answer.disqualifiers.length === 0 ? "yes" : "no",
    answer,
    model: msg.model,
    decidedAt: new Date().toISOString(),
  };
  cache?.set(q);
  return q;
}
