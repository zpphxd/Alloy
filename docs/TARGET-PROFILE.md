# Target profile: who we're hunting

This is the one-page answer to "what exact project and what exact client?" It comes from the 2026-09-28 call with Paul and his follow-up text. The numbers here are the starting point; `pescadora fit` refines them against years of ERCOT history (see "Fitting the profile" below).

## The goal

Get to **$1M+ in production** with a few large, complex accounts instead of volume. The math:
- One 600 MW solar project entering construction is worth about $3.3M in agency commission and ~$585k to the producer (builder's risk + tax insurance).
- One 100 MW storage project is worth ~$600k in commission: $100k P&C plus $500k from the tax policy. Paul said "about $1.5M," which counts the $1M premium; the open question in the brief covers this.
- One 200 MW operating solar project is ~$240k a year in recurring commission.

Paul's framing: "Find one hundred perfect fits, and that's what we're going after." Then find out how we're connected to each one and go in through the warm path.

## The perfect-fit project

| | |
|---|---|
| **Technology** | Utility-scale solar, battery storage (standalone or co-located), solar + storage. Secondary: RNG and wind. |
| **Size** | ~150-600 MW per project; ~100 MW+ for standalone storage |
| **Where** | Texas / ERCOT first: it's the most transparent queue. CAISO, PJM, ISO-NE, MISO (Entergy), and SPP come next. |
| **Stage** | Late development moving to construction: IA signed, financial security posted, COD in the next 12-18 months. That's when builder's risk and **tax credit insurance** get bought. Operating assets are the recurring renewal. |
| **Examples (Paul)** | Ash Creek, Gemini, Prairie Mist, Bocanova, Aktina, Longbow |

## The perfect-fit client

| | |
|---|---|
| **Who** | Independent developers and IPPs that are **early in their growth**, the way Nightpeak Energy, Primergy Power (fka Primergy Solar), and Avantus looked **two years ago**. |
| **Portfolio shape** | Roughly 3-12 projects. A modest operating fleet (a few hundred MW up to ~1.5 GW) behind a much larger pipeline (1-2 GW+). Adding projects every year. |
| **Why them** | Multiple bites of the apple: builder's risk and tax insurance on each new build, then operating P&C every year. They're growing fast enough to need a specialist, but they're not yet locked into a mega-broker program. |
| **Complexity** | The more the better: mixed technologies, tax equity or transferability, lender requirements, and construction exposure. That's where our advice wins. |
| **Buyers to reach** | CFO, VP Finance / Project Finance, Head of Risk / Insurance, and the CEO/Founder at smaller shops |

**Not a fit:** majors and their subsidiaries (BP, NextEra, and the like: "Who cares?"), anyone already a Baldwin or CAC account, one-off single-project owners with no pipeline, and anything too big to win in one or two touches.

## Other streams (same idea, different fish)

- **RNG platforms** with 5+ projects ($10-30M each). They're unsophisticated buyers and carry tax policies too.
- **Oil & gas operators** with 50-300 wells, from Texas Railroad Commission data.
- **Oilfield service rental** (crane, compression, downhole tools): Nova Compression lookalikes.

## Buying triggers (when to call)

| Signal in the queue | What it means |
|---|---|
| New interconnection filing | The relationship starts now, long before anyone else calls |
| IA signed | Builder's risk + tax insurance within ~12 months |
| Financial security / NTP posted | Construction is imminent: quote now |
| COD inside 12 months | The operating program needs placing |
| Interconnecting entity changed | M&A: a new owner means a new broker decision |

## Fitting the profile

The ranges above are judgment calls. `pescadora fit` replaces them with measurements:
1. Load as many back GIS reports as we can get (`pescadora backfill ercot`).
2. For each seed company, track its ERCOT portfolio month by month and read off its shape two years before the latest report.
3. For each seed project, measure size, technology, and months from filing to IA, to financial security, and to sync.
4. Widen those numbers into a proposed `seed-lookalike` fly, then list who matches it today.
5. Zach and Paul review the proposed fly before it goes into `config/flies.ts`. Jev then qualifies each match (see `HANDOFF.md`).
