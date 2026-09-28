import type { Fly } from "../../config/flies.ts";
import type { Owner, Project, PortfolioSummary } from "../domain/types.ts";
import { monthsUntil, pipelineMw } from "../portfolio/aggregate.ts";

export interface GateResult {
  flyId: string;
  pass: boolean;
  /** Human-readable reasons, pass or fail, so every decision is auditable. */
  reasons: string[];
}

/**
 * Hard gates for the ERCOT stream. Pure code, no model: the same input always
 * gives the same answer. Only owners that pass a gate go to the qualifier.
 */
export function evaluateGates(
  fly: Fly,
  summary: PortfolioSummary,
  projects: Project[],
  now = new Date(),
): GateResult {
  const g = fly.gates;
  const reasons: string[] = [];
  let pass = true;
  const check = (ok: boolean, msg: string) => {
    reasons.push(`${ok ? "✓" : "✗"} ${msg}`);
    if (!ok) pass = false;
  };

  const live = projects.filter((p) => p.stage !== "withdrawn");
  const relevant = g.technologies ? live.filter((p) => g.technologies!.includes(p.technology)) : live;
  const opMw = relevant.filter((p) => p.stage === "operational").reduce((s, p) => s + p.capacityMw, 0);
  const pipeMw = g.technologies
    ? relevant.filter((p) => p.stage !== "operational").reduce((s, p) => s + p.capacityMw, 0)
    : pipelineMw(summary);

  if (g.technologies) check(relevant.length > 0, `has ${g.technologies.join("/")} projects (${relevant.length})`);
  if (g.minProjects !== undefined) check(relevant.length >= g.minProjects, `≥${g.minProjects} projects (${relevant.length})`);
  if (g.maxProjects !== undefined) check(relevant.length <= g.maxProjects, `≤${g.maxProjects} projects (${relevant.length})`);
  if (g.minMwOperational !== undefined) check(opMw >= g.minMwOperational, `≥${g.minMwOperational} MW operating (${opMw})`);
  if (g.maxMwOperational !== undefined) check(opMw <= g.maxMwOperational, `≤${g.maxMwOperational} MW operating (${opMw})`);
  if (g.minMwPipeline !== undefined) check(pipeMw >= g.minMwPipeline, `≥${g.minMwPipeline} MW pipeline (${pipeMw})`);
  if (g.maxMwPipeline !== undefined) check(pipeMw <= g.maxMwPipeline, `≤${g.maxMwPipeline} MW pipeline (${pipeMw})`);

  if (g.minProjectMw !== undefined || g.maxProjectMw !== undefined || g.codWithinMonths !== undefined) {
    const lo = g.minProjectMw ?? 0;
    const hi = g.maxProjectMw ?? Infinity;
    const fits = relevant.filter((p) => {
      if (p.capacityMw < lo || p.capacityMw > hi) return false;
      if (g.codWithinMonths === undefined) return true;
      if (p.stage === "operational" || !p.projectedCod) return false;
      const m = monthsUntil(p.projectedCod, now);
      return m >= 0 && m <= g.codWithinMonths;
    });
    const band = `${lo}-${hi === Infinity ? "∞" : hi} MW`;
    const cod = g.codWithinMonths !== undefined ? `, COD ≤${g.codWithinMonths} mo` : "";
    check(fits.length > 0, `project in ${band}${cod} (${fits.map((p) => `${p.name} ${p.capacityMw}MW`).join("; ") || "none"})`);
  }
  return { flyId: fly.id, pass, reasons };
}

/** Word-boundary match of exclusion terms against the owner, aliases, and parent. */
export function isExcluded(owner: Owner, excluded: string[]): string | null {
  const words = (n: string) => ` ${n.toLowerCase().replace(/[^a-z0-9ø]+/g, " ").trim()} `;
  const names = [owner.name, owner.parentName ?? "", ...owner.aliases].map(words);
  return excluded.find((x) => names.some((n) => n.includes(words(x)))) ?? null;
}
