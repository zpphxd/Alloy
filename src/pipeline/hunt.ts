import { EXCLUDED_OWNERS } from "../../config/exclusions.ts";
import { FLIES, type Fly } from "../../config/flies.ts";
import type { Owner, PortfolioSummary, Project, Trigger } from "../domain/types.ts";
import { estimatePortfolio, type ProjectEconomics } from "../economics/estimate.ts";
import { evaluateGates, isExcluded, type GateResult } from "../flies/match.ts";
import { aggregatePortfolios, pipelineMw } from "../portfolio/aggregate.ts";
import { resolveOwners, type AliasRow, type Resolution } from "../resolve/owner-resolver.ts";
import { findWarmPaths, type Connection, type WarmPath } from "../route/warm-path.ts";
import { screenOwner, type CrmAccount, type ScreenResult } from "../screen/crm-screen.ts";

export interface HuntInput {
  projects: Project[];
  aliases?: AliasRow[];
  connections?: Connection[];
  crm?: CrmAccount[];
  triggers?: Trigger[];
  flies?: Fly[];
  excluded?: string[];
  now?: Date;
}

export interface Target {
  owner: Owner;
  summary: PortfolioSummary;
  projects: Project[];
  flies: GateResult[];
  economics: ProjectEconomics;
  screen: ScreenResult;
  warmPath: WarmPath;
  triggers: Trigger[];
  /** True when the owner is still an SPV/stem guess and needs resolving. */
  unresolved: boolean;
}

export interface HuntResult {
  targets: Target[];
  excluded: Array<{ owner: Owner; term: string }>;
  resolutions: Resolution[];
}

/**
 * One pass of the machine: projects in, ranked targets out. Pure and
 * synchronous. Claude (qualification, web resolution) and ZoomInfo
 * enrichment are separate steps that run on this output.
 */
export function hunt(input: HuntInput): HuntResult {
  const now = input.now ?? new Date();
  const flies = (input.flies ?? FLIES).filter((f) => f.stream === "ercot");
  const { owners, resolutions } = resolveOwners(input.projects, input.aliases ?? []);
  const portfolios = aggregatePortfolios(input.projects, resolutions, now);
  const ownerOfProject = new Map(resolutions.map((r) => [r.projectId, r.ownerId]));

  const triggersByOwner = new Map<string, Trigger[]>();
  for (const t of input.triggers ?? []) {
    const o = t.ownerId ?? (t.projectId ? ownerOfProject.get(t.projectId) : undefined);
    if (!o) continue;
    triggersByOwner.set(o, [...(triggersByOwner.get(o) ?? []), { ...t, ownerId: o }]);
  }

  const targets: Target[] = [];
  const excluded: HuntResult["excluded"] = [];
  for (const owner of owners) {
    const term = isExcluded(owner, input.excluded ?? EXCLUDED_OWNERS);
    if (term) {
      excluded.push({ owner, term });
      continue;
    }
    const pf = portfolios.get(owner.id);
    if (!pf) continue;
    const gates = flies.map((f) => evaluateGates(f, pf.summary, pf.projects, now));
    if (!gates.some((g) => g.pass)) continue;

    targets.push({
      owner,
      summary: pf.summary,
      projects: pf.projects,
      flies: gates.filter((g) => g.pass),
      economics: estimatePortfolio(pf.projects),
      screen: screenOwner(owner, input.crm ?? []),
      warmPath: findWarmPaths(owner, input.connections ?? []),
      triggers: triggersByOwner.get(owner.id) ?? [],
      unresolved: owner.id.startsWith("unresolved:"),
    });
  }

  // Rank: estimated commission, with a bump for fresh triggers and a warm way in.
  const score = (t: Target) =>
    t.economics.totalCommission * (1 + 0.25 * Math.min(t.triggers.length, 4)) * (t.warmPath.paths.length ? 1.5 : 1);
  targets.sort((a, b) => score(b) - score(a));
  return { targets, excluded, resolutions };
}

/** Plain-text dossier for the qualifier and for a producer's pre-call read. */
export function dossier(t: Target, extra: string[] = []): string {
  const s = t.summary;
  const lines = [
    `Owner: ${t.owner.name}${t.owner.parentName ? ` (parent: ${t.owner.parentName})` : ""}`,
    `Aliases / filing entities: ${t.owner.aliases.join("; ")}`,
    `ERCOT queue projects: ${s.projectCount} active; operating ${s.mwByStage.operational} MW; pipeline ${pipelineMw(s)} MW ` +
      `(construction ${s.mwByStage.construction}, late development ${s.mwByStage.late_development}, development ${s.mwByStage.development})`,
    `By technology: ${Object.entries(s.mwByTechnology).map(([k, v]) => `${k} ${v} MW`).join(", ")}`,
    "Projects:",
    ...t.projects.map(
      (p) => `- ${p.name} [${p.id}] ${p.technology} ${p.capacityMw} MW, ${p.stage}, ${p.county ?? "?"} County, COD ${p.projectedCod ?? "?"}`,
    ),
    t.triggers.length ? "Recent changes:" : "Recent changes: none detected",
    ...t.triggers.map((tr) => `- ${tr.kind}: ${tr.detail}`),
    ...extra,
  ];
  return lines.join("\n");
}
