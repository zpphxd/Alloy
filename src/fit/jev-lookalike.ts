import { noul, score, type TypeSafeClient } from "@typesafe-ai/sdk";
import { jev } from "../lib/jev.ts";
import { dossier, type Target } from "../pipeline/hunt.ts";
import type { FitResult } from "./seed-fit.ts";

/**
 * Jev ranks the fitted-profile matches: "How much does this company today look
 * like Nightpeak / Primergy / Avantus did two years ago?" The gates in
 * seed-fit.ts decide who's in range; Jev orders them by resemblance.
 */
export interface LookalikeScore {
  ownerId: string;
  ownerName: string;
  /** Expected score, 0 (no resemblance) to 4 (near-identical shape). */
  resemblance: number;
  confidence: number;
  pEarlyGrowth: number;
  pIndependent: number;
}

export const RESEMBLANCE_RUBRIC = [
  "No resemblance: different size, mix, or stage entirely.",
  "Weak: shares one trait (e.g. technology) but not the portfolio shape.",
  "Partial: similar size or mix, but a different operating-vs-pipeline balance.",
  "Strong: similar size, technology mix, and a pipeline outgrowing the operating fleet.",
  "Near-identical shape to a seed company at the lookback date.",
] as const;

export function seedProfileState(fit: FitResult) {
  return fit.atLookback
    .filter((a) => a.point)
    .map(({ seed, point: p }) => ({
      seed,
      as_of: p!.asOf,
      projects: p!.projectCount,
      operating_mw: p!.mwOperational,
      pipeline_mw: p!.mwPipeline,
      mw_by_technology: p!.mwByTechnology,
      median_project_mw: p!.medianProjectMw,
    }));
}

export async function scoreLookalikes(
  targets: Target[],
  fit: FitResult,
  client: TypeSafeClient = jev(),
): Promise<LookalikeScore[]> {
  const seeds = seedProfileState(fit);
  if (!seeds.length) throw new Error("No seed company was found in the history, so there is nothing to compare against. Map the seeds' SPVs first.");
  const out: LookalikeScore[] = [];
  for (const t of targets) {
    const { answers } = await client.systemOne({
      state: {
        context: `Seed companies are shown as they looked at ${fit.lookbackAsOf}, when they started growing. The candidate is shown as of ${fit.latestAsOf}.`,
        seed_companies_at_lookback: seeds,
        candidate: dossier(t),
      },
      questions: {
        resemblance: score(
          "How closely does the candidate's portfolio today resemble any seed company's portfolio at the lookback date (size, technology mix, operating vs. pipeline, growth)?",
          RESEMBLANCE_RUBRIC,
        ),
        early_growth: noul("Is the candidate early in a growth phase, with its pipeline much larger than its operating fleet?"),
        independent: noul("Is the candidate an independent developer or IPP, not a major or a subsidiary of one?"),
      },
    });
    out.push({
      ownerId: t.owner.id,
      ownerName: t.owner.name,
      resemblance: answers.resemblance.score,
      confidence: answers.resemblance.confidence,
      pEarlyGrowth: answers.early_growth.noul,
      pIndependent: answers.independent.noul,
    });
  }
  return out.sort((a, b) => b.resemblance - a.resemblance);
}
