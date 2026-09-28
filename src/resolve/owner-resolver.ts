import type { Owner, Project } from "../domain/types.ts";
import { parseCsvRecords } from "../lib/csv.ts";

/**
 * Project -> owner resolution. This is the hard part of the chain. Paul:
 * "There's one called, like, Albatross Solar and Albatross BESS. No idea who
 * owns them." The queue lists the filing entity, which is usually a
 * single-purpose LLC.
 *
 * Resolution order (cheapest and most trustworthy first):
 *  1. Curated alias table: human-confirmed "SPV -> owner" mappings. Every
 *     confirmed answer from steps 3-4 is written back here, so the table is
 *     the knowledge flywheel.
 *  2. Stem grouping: "Albatross Solar LLC" and "Albatross BESS LLC" share the
 *     stem "albatross", so they're almost certainly the same sponsor.
 *  3. ZoomInfo company match on the entity name (works when the filer is
 *     the developer itself, e.g. "Nightpeak Energy LLC").
 *  4. Claude + web search on whatever is still unknown (src/resolve/claude-resolver.ts).
 */

const ENTITY_SUFFIXES =
  /\b(l\.?l\.?c\.?|inc\.?|corp\.?|co\.?|l\.?p\.?|ltd\.?|holdings?|project ?co|opco|devco|company)\b/g;
const PROJECT_WORDS =
  /\b(solar|bess|storage|energy|power|wind|renewables?|project|generation|gen|park|farm|ranch|hybrid|ess|pv|battery|center|facility|phase|i{1,3}|iv|v|[0-9]+[a-z]?)\b/g;

export function normalizeEntity(name: string): string {
  return name
    .toLowerCase()
    .replace(/[,.'"()&/-]/g, " ")
    .replace(ENTITY_SUFFIXES, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "Albatross BESS, LLC" -> "albatross". Empty when nothing distinctive is left. */
export function projectStem(name: string): string {
  return normalizeEntity(name).replace(PROJECT_WORDS, " ").replace(/\s+/g, " ").trim();
}

export interface AliasRow {
  /** Normalized entity name or stem. */
  match: string;
  ownerId: string;
  ownerName: string;
  source: "manual" | "zoominfo" | "claude_web" | "paul";
  confirmedBy?: string;
}

export interface Resolution {
  projectId: string;
  ownerId: string;
  ownerName: string;
  method: "alias" | "stem" | "entity" | "unresolved";
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * Deterministic resolution (steps 1-2). Unresolved projects fall back to
 * owner = their own filing entity, flagged so step 3/4 can pick them up.
 */
export function resolveOwners(projects: Project[], aliases: AliasRow[]): { owners: Owner[]; resolutions: Resolution[] } {
  const byMatch = new Map(aliases.map((a) => [a.match, a]));
  const owners = new Map<string, Owner>();
  const resolutions: Resolution[] = [];

  const upsert = (id: string, name: string, alias: string) => {
    const o = owners.get(id) ?? { id, name, aliases: [] };
    if (alias && !o.aliases.includes(alias)) o.aliases.push(alias);
    owners.set(id, o);
    return o;
  };

  for (const p of projects) {
    const entity = p.interconnectingEntity ?? p.name;
    const norm = normalizeEntity(entity);
    const stem = projectStem(entity) || projectStem(p.name);

    const hit = byMatch.get(norm) ?? (stem ? byMatch.get(stem) : undefined);
    if (hit) {
      upsert(hit.ownerId, hit.ownerName, entity);
      resolutions.push({ projectId: p.id, ownerId: hit.ownerId, ownerName: hit.ownerName, method: "alias" });
      continue;
    }
    // Group by the stem when there is one, otherwise by the entity itself.
    const id = `unresolved:${slug(stem || norm)}`;
    const o = upsert(id, entity, entity);
    resolutions.push({ projectId: p.id, ownerId: id, ownerName: o.name, method: stem ? "stem" : "entity" });
  }
  return { owners: [...owners.values()], resolutions };
}

/** CSV columns: match,owner_name,owner_id,source,confirmed_by */
export function parseAliasCsv(csv: string): AliasRow[] {
  return parseCsvRecords(csv).map((row) => ({
    match: normalizeEntity(row.match ?? ""),
    ownerId: row.owner_id || slug(row.owner_name ?? ""),
    ownerName: row.owner_name ?? "",
    source: (row.source as AliasRow["source"]) || "manual",
    confirmedBy: row.confirmed_by || undefined,
  }));
}
