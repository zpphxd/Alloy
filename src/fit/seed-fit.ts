import type { Fly } from "../../config/flies.ts";
import type { Project, Technology } from "../domain/types.ts";
import { monthsUntil } from "../portfolio/aggregate.ts";
import { normalizeEntity, type AliasRow } from "../resolve/owner-resolver.ts";
import type { Snapshot } from "../store/db.ts";

/**
 * Fit the target profiles to history. Paul: "Find companies today that look
 * like these two years ago, when they started growing."
 *
 * Given every GIS snapshot we have (oldest first), this:
 *  1. Tracks each seed company's ERCOT portfolio over time (project count,
 *     MW operating vs. pipeline, technology mix, project sizes).
 *  2. Reads off what each seed looked like `lookbackMonths` before the latest
 *     snapshot, and turns that into a proposed "seed-lookalike" fly.
 *  3. Profiles the seed projects: size, technology, and months from first
 *     filing to IA, to financial security, and to sync.
 *
 * It's plain code: the proposal is for Zach and Paul to review, not an
 * automatic edit of config/flies.ts.
 */

export interface Seeds {
  companies: string[];
  formerNames?: Record<string, string[]>;
  projects: string[];
}

export interface PortfolioPoint {
  asOf: string;
  projectCount: number;
  mwOperational: number;
  mwPipeline: number;
  mwByTechnology: Partial<Record<Technology, number>>;
  medianProjectMw: number;
  maxProjectMw: number;
  projectNames: string[];
}

export interface CompanyTimeline {
  seed: string;
  points: PortfolioPoint[];
}

export interface ProjectHistory {
  seed: string;
  projectId: string;
  name: string;
  entity: string | null;
  technology: Technology;
  capacityMw: number;
  county: string | null;
  firstSeen: string;
  iaSigned: string | null;
  financialSecurity: string | null;
  approvedForSync: string | null;
  monthsToIa: number | null;
  monthsToFinancialSecurity: number | null;
  monthsToSync: number | null;
}

export interface FitResult {
  latestAsOf: string;
  lookbackAsOf: string;
  companies: CompanyTimeline[];
  /** Each seed's state at the lookback point (nearest snapshot at or before it). */
  atLookback: Array<{ seed: string; point: PortfolioPoint | null }>;
  projects: ProjectHistory[];
  proposedFly: Fly | null;
  notes: string[];
}

const words = (s: string) => ` ${normalizeEntity(s)} `;

function matchesCompany(p: Project, names: string[], aliasOwners: Set<string>): boolean {
  const entity = words(p.interconnectingEntity ?? "");
  const project = words(p.name);
  if (names.some((n) => entity.includes(words(n)) || project.includes(words(n)))) return true;
  return aliasOwners.has(normalizeEntity(p.interconnectingEntity ?? ""));
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function portfolioPoint(asOf: string, projects: Project[]): PortfolioPoint {
  const live = projects.filter((p) => p.stage !== "withdrawn");
  const byTech: Partial<Record<Technology, number>> = {};
  for (const p of live) byTech[p.technology] = (byTech[p.technology] ?? 0) + p.capacityMw;
  const sizes = live.map((p) => p.capacityMw);
  return {
    asOf,
    projectCount: live.length,
    mwOperational: live.filter((p) => p.stage === "operational").reduce((s, p) => s + p.capacityMw, 0),
    mwPipeline: live.filter((p) => p.stage !== "operational").reduce((s, p) => s + p.capacityMw, 0),
    mwByTechnology: byTech,
    medianProjectMw: median(sizes),
    maxProjectMw: sizes.length ? Math.max(...sizes) : 0,
    projectNames: live.map((p) => p.name),
  };
}

function monthsBetween(from: string, to: string | null): number | null {
  return to ? monthsUntil(to, new Date(from)) : null;
}

function shiftMonths(iso: string, months: number): string {
  const d = new Date(iso);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function fitSeeds(snapshots: Snapshot[], seeds: Seeds, aliases: AliasRow[] = [], lookbackMonths = 24): FitResult {
  const notes: string[] = [];
  if (!snapshots.length) throw new Error("No snapshots loaded. Run `pescadora backfill ercot` first.");
  const latestAsOf = snapshots[snapshots.length - 1]!.asOf;
  const lookbackAsOf = shiftMonths(latestAsOf, -lookbackMonths);
  if (snapshots[0]!.asOf > lookbackAsOf) {
    notes.push(`History starts ${snapshots[0]!.asOf}, after the ${lookbackAsOf} lookback point. Load older reports for a true "two years ago" read.`);
  }

  // 1-2. Company timelines.
  const companies: CompanyTimeline[] = seeds.companies.map((seed) => {
    const names = [seed, ...(seeds.formerNames?.[seed] ?? [])];
    const aliasOwners = new Set(
      aliases.filter((a) => names.some((n) => normalizeEntity(a.ownerName) === normalizeEntity(n))).map((a) => a.match),
    );
    const points = snapshots
      .map((s) => portfolioPoint(s.asOf, s.projects.filter((p) => matchesCompany(p, names, aliasOwners))))
      .filter((pt) => pt.projectCount > 0);
    if (!points.length) {
      notes.push(`No ERCOT filings matched "${seed}" by name. Its projects are likely filed under SPVs; map them in config/owner-aliases.csv (or run \`pescadora resolve\`).`);
    }
    return { seed, points };
  });
  const atLookback = companies.map((c) => ({
    seed: c.seed,
    point: [...c.points].reverse().find((pt) => pt.asOf <= lookbackAsOf) ?? c.points[0] ?? null,
  }));

  // 3. Seed project histories: first appearance and milestone timing.
  const projects: ProjectHistory[] = [];
  for (const seed of seeds.projects) {
    const key = words(seed);
    const firstSeen = new Map<string, string>();
    const latest = new Map<string, Project>();
    for (const s of snapshots) {
      for (const p of s.projects) {
        if (!words(p.name).includes(key)) continue;
        if (!firstSeen.has(p.id)) firstSeen.set(p.id, s.asOf);
        latest.set(p.id, p);
      }
    }
    if (!latest.size) notes.push(`Seed project "${seed}" not found in the loaded ERCOT history. It may be outside ERCOT or filed under another name.`);
    for (const [id, p] of latest) {
      const seen = firstSeen.get(id)!;
      projects.push({
        seed,
        projectId: id,
        name: p.name,
        entity: p.interconnectingEntity,
        technology: p.technology,
        capacityMw: p.capacityMw,
        county: p.county,
        firstSeen: seen,
        iaSigned: p.iaSignedDate,
        financialSecurity: p.financialSecurityDate,
        approvedForSync: p.approvedForSyncDate,
        monthsToIa: monthsBetween(seen, p.iaSignedDate),
        monthsToFinancialSecurity: monthsBetween(seen, p.financialSecurityDate),
        monthsToSync: monthsBetween(seen, p.approvedForSyncDate),
      });
    }
  }

  return { latestAsOf, lookbackAsOf, companies, atLookback, projects, proposedFly: proposeFly(atLookback, projects), notes };
}

/**
 * Turn the seeds' lookback state into gates, widened by half on each side so
 * the fly catches companies of the same shape rather than only exact clones.
 */
export function proposeFly(
  atLookback: FitResult["atLookback"],
  projects: ProjectHistory[],
  widen = 0.5,
): Fly | null {
  const pts = atLookback.map((a) => a.point).filter((p): p is PortfolioPoint => p !== null);
  if (!pts.length && !projects.length) return null;
  const lo = (xs: number[]) => Math.floor(Math.min(...xs) * (1 - widen));
  const hi = (xs: number[]) => Math.ceil(Math.max(...xs) * (1 + widen));
  const sizes = [...pts.map((p) => p.medianProjectMw), ...projects.map((p) => p.capacityMw)].filter((x) => x > 0);
  const techs = new Set<Technology>();
  for (const p of pts) for (const t of Object.keys(p.mwByTechnology)) techs.add(t as Technology);
  for (const p of projects) techs.add(p.technology);

  return {
    id: "seed-lookalike",
    name: "Seed lookalike: portfolios shaped like Nightpeak / Primergy / Avantus two years ago",
    stream: "ercot",
    description: `Fitted from ${pts.length} seed companies and ${projects.length} seed projects in ERCOT history.`,
    rationale: "\"Especially if you find companies today that look like these 2 years ago when they started growing.\" (Paul, 2026-09-28)",
    gates: {
      technologies: techs.size ? [...techs] : undefined,
      ...(pts.length
        ? {
            minProjects: Math.max(2, lo(pts.map((p) => p.projectCount))),
            maxProjects: hi(pts.map((p) => p.projectCount)),
            maxMwOperational: hi(pts.map((p) => p.mwOperational)),
            minMwPipeline: lo(pts.map((p) => p.mwPipeline)),
          }
        : {}),
      ...(sizes.length ? { minProjectMw: lo(sizes), maxProjectMw: hi(sizes) } : {}),
    },
    rubric: [
      { id: "independent", question: "Is the owner an independent developer/IPP, not a major or a subsidiary of one?", required: true },
      { id: "growing", question: "Is the owner early in a growth phase (pipeline growing faster than its operating fleet)?", required: true },
    ],
  };
}
