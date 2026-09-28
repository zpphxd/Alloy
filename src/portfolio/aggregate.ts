import type { PortfolioSummary, Project, Stage, Technology } from "../domain/types.ts";
import type { Resolution } from "../resolve/owner-resolver.ts";

const STAGES: Stage[] = ["development", "late_development", "construction", "operational", "withdrawn"];
export const PIPELINE_STAGES: Stage[] = ["development", "late_development", "construction"];

export function monthsUntil(isoDate: string, now: Date): number {
  const d = new Date(isoDate);
  return (d.getUTCFullYear() - now.getUTCFullYear()) * 12 + (d.getUTCMonth() - now.getUTCMonth());
}

/** Roll projects up to one portfolio per owner. */
export function aggregatePortfolios(
  projects: Project[],
  resolutions: Resolution[],
  now = new Date(),
  nearTermMonths = 18,
): Map<string, { summary: PortfolioSummary; projects: Project[] }> {
  const ownerOf = new Map(resolutions.map((r) => [r.projectId, r.ownerId]));
  const out = new Map<string, { summary: PortfolioSummary; projects: Project[] }>();

  for (const p of projects) {
    const ownerId = ownerOf.get(p.id);
    if (!ownerId) continue;
    let entry = out.get(ownerId);
    if (!entry) {
      entry = {
        summary: {
          ownerId,
          projectCount: 0,
          mwByStage: Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<Stage, number>,
          mwByTechnology: {},
          nearTermProjects: [],
        },
        projects: [],
      };
      out.set(ownerId, entry);
    }
    const s = entry.summary;
    entry.projects.push(p);
    if (p.stage === "withdrawn") continue;
    s.projectCount++;
    s.mwByStage[p.stage] += p.capacityMw;
    s.mwByTechnology[p.technology as Technology] = (s.mwByTechnology[p.technology] ?? 0) + p.capacityMw;
    if (p.stage !== "operational" && p.projectedCod) {
      const m = monthsUntil(p.projectedCod, now);
      if (m >= 0 && m <= nearTermMonths) s.nearTermProjects.push(p);
    }
  }
  return out;
}

export function pipelineMw(s: PortfolioSummary): number {
  return PIPELINE_STAGES.reduce((sum, st) => sum + s.mwByStage[st], 0);
}
