import type { HuntResult } from "../pipeline/hunt.ts";
import type { LookalikeScore } from "./jev-lookalike.ts";
import { RESEMBLANCE_RUBRIC } from "./jev-lookalike.ts";
import type { FitResult } from "./seed-fit.ts";

/** Lines that must stay adjacent (table rows, list items). */
const table = (...rows: string[]) => rows.join("\n");
const mw = (n: number) => `${Math.round(n).toLocaleString("en-US")} MW`;

export function fitToMarkdown(f: FitResult, preview?: HuntResult, jevScores?: LookalikeScore[]): string {
  const out: string[] = [
    "# Profile fit: seed companies and projects in ERCOT history",
    `History through ${f.latestAsOf}. Lookback point: ${f.lookbackAsOf}.`,
  ];
  if (f.notes.length) out.push("## Notes", f.notes.map((n) => `- ${n}`).join("\n"));

  out.push("## Seed companies at the lookback point");
  out.push(table(
    "| Seed | As of | Projects | Operating | Pipeline | Median project | Largest |",
    "|---|---|---|---|---|---|---|",
    ...f.atLookback.map(({ seed, point: p }) =>
      p
        ? `| ${seed} | ${p.asOf} | ${p.projectCount} | ${mw(p.mwOperational)} | ${mw(p.mwPipeline)} | ${mw(p.medianProjectMw)} | ${mw(p.maxProjectMw)} |`
        : `| ${seed} | not found | | | | | |`,
    ),
  ));

  for (const c of f.companies.filter((c) => c.points.length)) {
    out.push(
      `### ${c.seed}: growth over time`,
      table(
        "| As of | Projects | Operating | Pipeline |",
        "|---|---|---|---|",
        ...c.points.map((p) => `| ${p.asOf} | ${p.projectCount} | ${mw(p.mwOperational)} | ${mw(p.mwPipeline)} |`),
      ),
    );
  }

  out.push("## Seed projects");
  if (!f.projects.length) out.push("None of the seed projects were found in the loaded history.");
  else
    out.push(table(
      "| Seed | Project | INR | Filed by | Tech | Size | County | First seen | → IA (mo) | → Fin. security (mo) | → Sync (mo) |",
      "|---|---|---|---|---|---|---|---|---|---|---|",
      ...f.projects.map(
        (p) =>
          `| ${p.seed} | ${p.name} | ${p.projectId} | ${p.entity ?? ""} | ${p.technology} | ${mw(p.capacityMw)} | ${p.county ?? ""} | ${p.firstSeen} | ${p.monthsToIa ?? "–"} | ${p.monthsToFinancialSecurity ?? "–"} | ${p.monthsToSync ?? "–"} |`,
      ),
    ));

  out.push("## Proposed fly (review before adding to config/flies.ts)");
  out.push(f.proposedFly ? "```json\n" + JSON.stringify(f.proposedFly, null, 2) + "\n```" : "Not enough seed data to propose gates.");

  if (preview) {
    out.push(
      `## Who matches the proposed fly today (${preview.targets.length})`,
      table(
        ...preview.targets.slice(0, 50).map(
          (t, i) => `${i + 1}. **${t.owner.name}**: ${t.summary.projectCount} projects, ${mw(t.summary.mwByStage.operational)} operating`,
        ),
      ),
    );
  }
  if (jevScores?.length) {
    const pct = (p: number) => `${Math.round(p * 100)}%`;
    out.push(
      "## Jev ranking: resemblance to the seeds two years ago",
      `Resemblance is Jev's expected score from 0 to 4: ${RESEMBLANCE_RUBRIC.map((d, i) => `${i} = ${d.split(":")[0]}`).join(", ")}.`,
      table(
        "| Rank | Company | Resemblance | Confidence | P(early growth) | P(independent) |",
        "|---|---|---|---|---|---|",
        ...jevScores.map(
          (j, i) => `| ${i + 1} | ${j.ownerName} | ${j.resemblance.toFixed(2)} | ${pct(j.confidence)} | ${pct(j.pEarlyGrowth)} | ${pct(j.pIndependent)} |`,
        ),
      ),
    );
  }
  return out.join("\n\n") + "\n";
}
