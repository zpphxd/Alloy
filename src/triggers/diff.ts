import type { Project, Trigger } from "../domain/types.ts";
import { monthsUntil } from "../portfolio/aggregate.ts";

/**
 * Month-over-month queue diff. This is the trigger-based approach Zach
 * described: the same idea as going after Section 8 housing three months
 * before close, applied to interconnection milestones. Each milestone opens
 * a buying window:
 *
 *   new_filing                 -> start the relationship (genesis)
 *   ia_signed                  -> builder's risk + tax insurance within ~12 mo
 *   financial_security_posted  -> construction is imminent: quote now
 *   cod_approaching            -> operating program needs to be placed
 *   owner_changed              -> M&A: new owner, new broker decision
 */
export interface DiffOptions {
  now?: Date;
  /** Fire cod_approaching when a COD first falls inside this many months. */
  codWindowMonths?: number;
}

export function diffSnapshots(prev: Project[], curr: Project[], opts: DiffOptions = {}): Trigger[] {
  const now = opts.now ?? new Date();
  const window = opts.codWindowMonths ?? 12;
  const detectedAt = now.toISOString();
  const before = new Map(prev.map((p) => [p.id, p]));
  const out: Trigger[] = [];
  const fire = (t: Omit<Trigger, "detectedAt">) => out.push({ ...t, detectedAt });

  const inWindow = (p: Project | undefined) => {
    if (!p?.projectedCod || p.stage === "operational") return false;
    const m = monthsUntil(p.projectedCod, now);
    return m >= 0 && m <= window;
  };

  for (const c of curr) {
    const p = before.get(c.id);
    if (!p) {
      fire({ kind: "new_filing", projectId: c.id, detail: `${c.name} (${c.capacityMw} MW ${c.technology}) filed by ${c.interconnectingEntity ?? "unknown"}` });
      if (inWindow(c)) fire({ kind: "cod_approaching", projectId: c.id, detail: `${c.name} projected COD ${c.projectedCod}`, after: c.projectedCod });
      continue;
    }
    if (!p.iaSignedDate && c.iaSignedDate) {
      fire({ kind: "ia_signed", projectId: c.id, detail: `${c.name}: interconnection agreement signed ${c.iaSignedDate}`, after: c.iaSignedDate });
    }
    if (!p.financialSecurityDate && c.financialSecurityDate) {
      fire({ kind: "financial_security_posted", projectId: c.id, detail: `${c.name}: financial security / NTP ${c.financialSecurityDate}`, after: c.financialSecurityDate });
    }
    if (p.projectedCod !== c.projectedCod && c.projectedCod) {
      fire({ kind: "cod_moved", projectId: c.id, detail: `${c.name}: COD ${p.projectedCod ?? "none"} -> ${c.projectedCod}`, before: p.projectedCod, after: c.projectedCod });
    }
    if (!inWindow(p) && inWindow(c)) {
      fire({ kind: "cod_approaching", projectId: c.id, detail: `${c.name} projected COD ${c.projectedCod} is inside ${window} months`, after: c.projectedCod });
    }
    if (p.capacityMw !== c.capacityMw) {
      fire({ kind: "capacity_changed", projectId: c.id, detail: `${c.name}: ${p.capacityMw} -> ${c.capacityMw} MW`, before: p.capacityMw, after: c.capacityMw });
    }
    if ((p.interconnectingEntity ?? "") !== (c.interconnectingEntity ?? "")) {
      fire({ kind: "owner_changed", projectId: c.id, detail: `${c.name}: ${p.interconnectingEntity ?? "?"} -> ${c.interconnectingEntity ?? "?"}`, before: p.interconnectingEntity, after: c.interconnectingEntity });
    }
  }
  return out;
}
