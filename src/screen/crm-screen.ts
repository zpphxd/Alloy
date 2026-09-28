import type { Owner } from "../domain/types.ts";
import { parseCsvRecords } from "../lib/csv.ts";
import { normalizeEntity } from "../resolve/owner-resolver.ts";

/**
 * "We gotta get them through both the CAC and the Baldwin status." Before we
 * spend a minute on a target, confirm nobody at Baldwin or CAC already owns
 * the relationship.
 *
 * Input is a CSV export from each CRM (Salesforce/Stratus on the Baldwin
 * side). Required columns: account_name,status,owner. Anything with a
 * matching normalized name is flagged, and a human makes the call.
 */
export type ScreenStatus = "clear" | "baldwin_account" | "cac_account";

export interface CrmAccount {
  system: "baldwin" | "cac";
  accountName: string;
  status: string;
  owner: string;
}

export interface ScreenResult {
  status: ScreenStatus;
  matches: CrmAccount[];
}

export function parseCrmCsv(csv: string, system: CrmAccount["system"]): CrmAccount[] {
  return parseCsvRecords(csv).map((r) => ({
    system,
    accountName: r.account_name ?? "",
    status: r.status ?? "",
    owner: r.owner ?? "",
  }));
}

export function screenOwner(owner: Owner, accounts: CrmAccount[]): ScreenResult {
  const names = new Set([owner.name, ...owner.aliases, owner.parentName ?? ""].map(normalizeEntity).filter(Boolean));
  const matches = accounts.filter((a) => names.has(normalizeEntity(a.accountName)));
  if (matches.some((m) => m.system === "baldwin")) return { status: "baldwin_account", matches };
  if (matches.some((m) => m.system === "cac")) return { status: "cac_account", matches };
  return { status: "clear", matches };
}
