import { noul, type Questions, type TypeSafeClient } from "@typesafe-ai/sdk";
import type { Fly } from "../../config/flies.ts";
import { jev } from "../lib/jev.ts";
import { MIN_PROBABILITY, type CriterionAnswer, type QualifierEngine } from "./qualifier.ts";

/**
 * Jev (TypeSafe's "System One" model) as the qualifier engine. It doesn't
 * write text: it reads a state and answers typed questions with
 * probabilities. That's the deterministic yes/no Zach wanted.
 *
 * Mapping:
 *  - state      = the target profile + the dossier
 *  - questions  = one yes/no ("noul") per rubric item, keyed by its id, plus
 *                 a "major or subsidiary of one?" check that becomes a disqualifier
 *  - answers    = P(yes) per question -> CriterionAnswer.probability; met at >= 0.5.
 *                 The verdict (qualifier.ts) still needs >= MIN_PROBABILITY on required items.
 */
const MAJOR_KEY = "disqualifier_major";

const YES = "The dossier clearly supports this.";
const NO = "The dossier contradicts this, or doesn't establish it.";

export function jevQuestions(fly: Fly): Questions {
  const q: Questions = {};
  for (const r of fly.rubric) q[r.id] = noul(r.question, { true: YES, false: NO });
  q[MAJOR_KEY] = noul(
    "Is this owner a major (oil major, investor-owned utility, or top-10 national IPP) or a subsidiary of one?",
    { true: "Yes: a major or owned by one.", false: "No: independent, or not established by the dossier." },
  );
  return q;
}

export function jevState(fly: Fly, dossier: string) {
  return {
    context:
      "Prospect qualification for a commercial insurance team specializing in renewable energy, battery storage, and energy infrastructure (builder's risk, operating P&C, tax credit insurance). Judge only from the dossier.",
    target_profile: { name: fly.name, description: fly.description },
    dossier,
  };
}

const pct = (p: number) => `${Math.round(p * 100)}%`;

export function jevEngine(client: TypeSafeClient = jev()): QualifierEngine {
  return {
    id: `jev:${client.defaultModel}`,
    async answer(fly, dossier) {
      const { answers, model } = await client.systemOne({ state: jevState(fly, dossier), questions: jevQuestions(fly) });
      const criteria: CriterionAnswer[] = fly.rubric.map((r) => {
        const a = answers[r.id];
        const p = a?.type === "noul" ? a.noul : 0;
        return { id: r.id, met: p >= 0.5, probability: p, evidence: `Jev (${model}) P(yes) = ${pct(p)}` };
      });
      const major = answers[MAJOR_KEY];
      const pMajor = major?.type === "noul" ? major.noul : 0;
      const disqualifiers = pMajor >= MIN_PROBABILITY ? [`Likely a major or subsidiary of one (P = ${pct(pMajor)})`] : [];
      const summary = criteria
        .map((c) => `${c.met ? "✓" : "✗"} ${c.id} ${pct(c.probability ?? 0)}`)
        .concat(disqualifiers)
        .join(" · ");
      return { criteria, disqualifiers, summary };
    },
  };
}
