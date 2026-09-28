/**
 * Core domain model for Pescadora.
 *
 * The chain we hunt along is: Project (a queue filing, usually an SPV like
 * "Albatross BESS LLC") -> Owner (the developer/sponsor behind it) ->
 * Portfolio (everything that owner has, by technology and stage) -> Target
 * (an owner that matches one of our "flies" and survives screening).
 */

export type Technology =
  | "solar"
  | "storage"
  | "solar+storage"
  | "wind"
  | "wind+storage"
  | "gas"
  | "rng"
  | "other";

/**
 * Lifecycle stage drives which policies are in play:
 * - development: early queue filing. Too early to quote, but this is the
 *   genesis trigger: start the relationship here.
 * - late_development: IA signed / financial security posted. Builder's risk
 *   and tax insurance are coming within ~12 months.
 * - construction: builder's risk + tax insurance window.
 * - operational: annual operating P&C renewals.
 */
export type Stage = "development" | "late_development" | "construction" | "operational" | "withdrawn";

export interface Project {
  /** Stable source key, e.g. ERCOT INR "24INR0123". */
  id: string;
  source: "ercot_gis" | "ercot_colocated" | "rrc" | "manual";
  name: string;
  /** The filing entity as it appears in the source (often an SPV). */
  interconnectingEntity: string | null;
  technology: Technology;
  capacityMw: number;
  stage: Stage;
  county: string | null;
  state: string;
  projectedCod: string | null; // ISO date
  iaSignedDate: string | null;
  financialSecurityDate: string | null;
  approvedForSyncDate: string | null;
  /** Raw row, kept so nothing is lost if we need a field later. */
  raw: Record<string, unknown>;
}

export interface Owner {
  id: string;
  name: string;
  /** Owner names are messy; every alias we have seen maps here. */
  aliases: string[];
  zoominfoCompanyId?: string;
  website?: string;
  hqState?: string;
  employeeCount?: number;
  revenueUsd?: number;
  /** Parent company, when the owner is itself a subsidiary (e.g. of a major). */
  parentName?: string;
}

export interface PortfolioSummary {
  ownerId: string;
  projectCount: number;
  mwByStage: Record<Stage, number>;
  mwByTechnology: Partial<Record<Technology, number>>;
  /** Projects expected to hit construction/COD in the next 18 months. */
  nearTermProjects: Project[];
}

export type TriggerKind =
  | "new_filing" // new INR appeared in the queue
  | "ia_signed" // interconnection agreement executed
  | "financial_security_posted" // NTP / financial security provided
  | "cod_approaching" // projected COD inside the insurance-buying window
  | "cod_moved" // projected COD changed
  | "capacity_changed"
  | "owner_changed" // interconnecting entity changed: often an M&A signal
  | "scoop"; // ZoomInfo scoop (funding, exec hire, project news)

export interface Trigger {
  kind: TriggerKind;
  projectId?: string;
  ownerId?: string;
  detectedAt: string;
  detail: string;
  before?: unknown;
  after?: unknown;
}
