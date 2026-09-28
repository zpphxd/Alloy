import type { Owner } from "../domain/types.ts";
import { parseCsvRecords } from "../lib/csv.ts";
import { normalizeEntity } from "../resolve/owner-resolver.ts";

/**
 * "Then we identify how we're connected to them, and then we go do the thing."
 *
 * Source: each team member's official LinkedIn data export (Settings -> Data
 * privacy -> Get a copy of your data -> Connections). That's LinkedIn's own
 * export of your own network, so there's no scraping and no automation on
 * anyone's account. Drop the files at data/linkedin/<person>.csv.
 */
export interface Connection {
  via: string; // whose network: "zach", "paul", "tommy", ...
  firstName: string;
  lastName: string;
  company: string;
  position: string;
  url: string;
  connectedOn: string;
}

export function parseLinkedInConnections(csv: string, via: string): Connection[] {
  return parseCsvRecords(csv, (row) => row.map((c) => c.trim()).includes("First Name")).map((r) => ({
    via,
    firstName: r["first name"] ?? "",
    lastName: r["last name"] ?? "",
    company: r["company"] ?? "",
    position: r["position"] ?? "",
    url: r["url"] ?? "",
    connectedOn: r["connected on"] ?? "",
  }));
}

/** Rough decision-maker score for insurance buying at an IPP/developer. */
export function seniority(position: string): number {
  const p = position.toLowerCase();
  if (/\b(ceo|chief executive|founder|president|managing partner)\b/.test(p)) return 5;
  if (/\b(cfo|chief financial|treasurer|risk manager|head of risk|vp risk|director of risk|insurance)\b/.test(p)) return 5;
  if (/\b(coo|chief operating|general counsel|chief|evp|svp)\b/.test(p)) return 4;
  if (/\b(vp|vice president|head of)\b/.test(p)) return 3;
  if (/\b(director|project finance|development manager)\b/.test(p)) return 2;
  return 1;
}

export interface WarmPath {
  ownerId: string;
  paths: Array<Connection & { score: number }>;
}

/** Everyone in our combined network who works at the target, best first. */
export function findWarmPaths(owner: Owner, connections: Connection[]): WarmPath {
  const names = [owner.name, ...owner.aliases].map(normalizeEntity).filter((n) => n.length >= 3);
  const paths = connections
    .filter((c) => {
      const co = normalizeEntity(c.company);
      return co.length >= 3 && names.some((n) => co === n || co.startsWith(`${n} `) || n.startsWith(`${co} `));
    })
    .map((c) => ({ ...c, score: seniority(c.position) }))
    .sort((a, b) => b.score - a.score);
  return { ownerId: owner.id, paths };
}
