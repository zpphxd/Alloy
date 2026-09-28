import type { Stage, Technology } from "../domain/types.ts";

/**
 * Paul's rough math from the 2026-09-28 call. Every default below is a rule
 * of thumb from that conversation. They're parameters, not facts: confirm
 * them with Paul and the CAC team before quoting them to anyone.
 *
 * Worked examples from the call (the tests in test/economics.test.ts cover them):
 *  - 200 MW operating solar in Texas  -> ~$2.4M premium -> ~$240k commission
 *  - 600 MW solar entering construction -> ~$3M builder's-risk premium,
 *    tax policy limit ~$300M (40% of ~$600M value, grossed up for taxes),
 *    tax commission = 1% of limit = ~$3M; producer gets 15% of tax commission
 *    (~$450k) + 45% of P&C commission (~$135k) = ~$585k
 *  - 100 MW storage -> ~$1M premium (~$100k commission) + $50M tax policy
 *    (~$500k tax commission)
 */
export interface EconomicsAssumptions {
  /** Installed cost, USD per MW. Paul used ~$1M/MW for solar and storage. */
  projectValuePerMw: Partial<Record<Technology, number>>;
  /** Annual operating P&C premium, USD per MW. */
  operatingPremiumPerMw: Partial<Record<Technology, number>>;
  /** Builder's risk / construction premium, USD per MW (one-time). */
  constructionPremiumPerMw: Partial<Record<Technology, number>>;
  /** Tax insurance limit as a share of project value, before gross-up. */
  taxLimitPctOfValue: number;
  /** Gross-up so the limit covers the tax owed on a payout. */
  taxGrossUp: number;
  /** Agency commission on a tax policy, as a share of the limit. */
  taxCommissionPctOfLimit: number;
  /** Agency commission on P&C premium. */
  pcCommissionRate: number;
  /** Producer share of agency commission. */
  producerSplitPc: number;
  producerSplitTax: number;
  /** Technologies that carry a tax-credit insurance opportunity. */
  taxEligible: Technology[];
}

export const DEFAULT_ASSUMPTIONS: EconomicsAssumptions = {
  projectValuePerMw: {
    solar: 1_000_000,
    storage: 1_000_000,
    "solar+storage": 1_000_000,
    wind: 1_000_000,
    "wind+storage": 1_000_000,
  },
  operatingPremiumPerMw: {
    solar: 12_000, // 200 MW -> $2.4M
    storage: 10_000, // 100 MW -> $1M
    "solar+storage": 12_000,
    wind: 12_000,
    "wind+storage": 12_000,
  },
  constructionPremiumPerMw: {
    solar: 5_000, // 600 MW -> $3M
    storage: 10_000,
    "solar+storage": 5_000,
    wind: 5_000,
    "wind+storage": 5_000,
  },
  taxLimitPctOfValue: 0.4,
  taxGrossUp: 1.25,
  taxCommissionPctOfLimit: 0.01,
  pcCommissionRate: 0.1,
  producerSplitPc: 0.45,
  producerSplitTax: 0.15,
  // Paul: tax insurance "mostly applies to solar, battery storage, wind, RNG."
  // Not crypto mining or gas power plants.
  taxEligible: ["solar", "storage", "solar+storage", "wind", "wind+storage", "rng"],
};

export interface ProjectEconomics {
  projectValue: number;
  pcPremium: number;
  pcCommission: number;
  taxLimit: number;
  taxCommission: number;
  /** Agency revenue: what counts toward a production goal. */
  totalCommission: number;
  producerComp: number;
  /** Which policies drove the number. */
  basis: string[];
}

export function estimateProject(
  input: { technology: Technology; capacityMw: number; stage: Stage },
  a: EconomicsAssumptions = DEFAULT_ASSUMPTIONS,
): ProjectEconomics {
  const { technology, capacityMw, stage } = input;
  const value = capacityMw * (a.projectValuePerMw[technology] ?? 0);
  const basis: string[] = [];

  let pcPremium = 0;
  if (stage === "operational") {
    pcPremium = capacityMw * (a.operatingPremiumPerMw[technology] ?? 0);
    basis.push("operating P&C (annual)");
  } else if (stage === "construction" || stage === "late_development") {
    pcPremium = capacityMw * (a.constructionPremiumPerMw[technology] ?? 0);
    basis.push("builder's risk");
  }

  // The tax policy is bound around construction/placed-in-service, so it's
  // live for late-development and construction projects. Operating projects
  // have usually placed it already, and early development is too far out.
  let taxLimit = 0;
  if (a.taxEligible.includes(technology) && (stage === "late_development" || stage === "construction")) {
    taxLimit = value * a.taxLimitPctOfValue * a.taxGrossUp;
    basis.push("tax credit insurance (one-time)");
  }

  const pcCommission = pcPremium * a.pcCommissionRate;
  const taxCommission = taxLimit * a.taxCommissionPctOfLimit;
  return {
    projectValue: value,
    pcPremium,
    pcCommission,
    taxLimit,
    taxCommission,
    totalCommission: pcCommission + taxCommission,
    producerComp: pcCommission * a.producerSplitPc + taxCommission * a.producerSplitTax,
    basis,
  };
}

/** Sum the economics across an owner's projects. */
export function estimatePortfolio(
  projects: Array<{ technology: Technology; capacityMw: number; stage: Stage }>,
  a: EconomicsAssumptions = DEFAULT_ASSUMPTIONS,
): ProjectEconomics {
  const total: ProjectEconomics = {
    projectValue: 0,
    pcPremium: 0,
    pcCommission: 0,
    taxLimit: 0,
    taxCommission: 0,
    totalCommission: 0,
    producerComp: 0,
    basis: [],
  };
  for (const p of projects) {
    if (p.stage === "withdrawn") continue;
    const e = estimateProject(p, a);
    total.projectValue += e.projectValue;
    total.pcPremium += e.pcPremium;
    total.pcCommission += e.pcCommission;
    total.taxLimit += e.taxLimit;
    total.taxCommission += e.taxCommission;
    total.totalCommission += e.totalCommission;
    total.producerComp += e.producerComp;
    for (const b of e.basis) if (!total.basis.includes(b)) total.basis.push(b);
  }
  return total;
}
