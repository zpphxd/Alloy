# Project Pescadora

**A precision hunting system for high-value energy insurance clients.**

It was born on the 2026-09-28 call between Zach and Paul ("Solar and Storage Project Strategy"). The goal is to stop carpet bombing and go after about 100 perfect-fit accounts, such as solar and storage developers, RNG platforms, and oil & gas operators, where a single project can be worth $250k-$600k to the producer.

> "It doesn't take volume, it takes specificity." (Paul)

Named for Pescador On The Fly, the off-brand reel that outperforms the big names without their marketing. The target profiles are **flies**, the data sources are **streams**, and the output is a ranked list of fish, each with a reason to call now and a warm way in.

- **What we're hunting and why:** [docs/BRIEF-2026-09-28.md](docs/BRIEF-2026-09-28.md)
- **How the machine works:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## How it works

```
ERCOT interconnection queue ─┐
Texas RRC wells/permits ─────┼─► snapshot ─► triggers (IA signed, NTP, COD approaching, new filing)
ZoomInfo scoops/intent ──────┘       │
                                     ▼
          SPV → owner resolution ─► portfolio rollup ─► fly gates ─► exclusions ─► Baldwin/CAC screen
                                                                                      │
          LinkedIn exports (Zach, Paul, team) ─► warm paths ──────────────────────────┤
                                                                                      ▼
                            Claude qualifier (yes/no per criterion, cached) ─► ranked hunt report ─► drafts (human sends)
```

## Quickstart

Requires Node 22.13+.

```bash
npm install
cp .env.example .env          # add ANTHROPIC_API_KEY; ZoomInfo creds optional

# 1. Load the ERCOT GIS report: downloads the latest, or pass the file Paul sends
npm run pescadora -- ingest ercot --file ~/Downloads/GIS_Report_August2026.xlsx

# 2. Optional context (all gitignored under data/):
#    data/linkedin/zach.csv, data/linkedin/paul.csv   LinkedIn "Connections" exports
#    data/crm/baldwin.csv, data/crm/cac.csv           account_name,status,owner
#    config/owner-aliases.csv                         confirmed SPV -> owner mappings

# 3. Hunt: writes data/out/hunt-<date>.md and .csv
npm run pescadora -- hunt
npm run pescadora -- hunt --qualify 20      # Claude yes/no on the top 20

# 4. Resolve unknown SPVs with web research, then confirm in data/review/owner-findings.csv
npm run pescadora -- resolve --top 15

# 5. Draft (never send) a first touch
npm run pescadora -- draft --owner "Mesquite" --from "Zach Powers"

# Paul's napkin math for one project
npm run pescadora -- econ --tech solar --mw 600 --stage construction
```

Next month, ingest the new report again. The diff against last month is where the triggers come from.

## Development

```bash
npm test            # vitest: economics, ERCOT parser, triggers, resolution, hunt, qualifier
npm run typecheck
```

## Layout

```
config/          flies.ts (target profiles), exclusions.ts, owner-aliases.csv
src/sources/     ercot/ (GIS + co-located reports), rrc/
src/triggers/    month-over-month diff → buying-window triggers
src/resolve/     SPV → owner (alias table, stems, Claude + web search)
src/portfolio/   per-owner rollup by stage and technology
src/flies/       deterministic gate evaluation + exclusions
src/screen/      Baldwin / CAC CRM screen
src/route/       warm paths from LinkedIn exports
src/qualify/     Claude yes/no qualifier (structured output, cached)
src/economics/   premium + tax commission estimates (Paul's rules of thumb)
src/enrich/      ZoomInfo (API client + saved-session loader)
src/outreach/    draft generator (human sends)
src/pipeline/    hunt orchestration + reports
src/store/       SQLite snapshots, triggers, qualification cache
```

## Roadmap

**Phase 1: First catch (this week)**
- [x] ERCOT GIS ingest, snapshots, trigger diff
- [x] Flies, gates, exclusions, economics, CRM screen, warm paths, report
- [x] Claude qualifier, web owner resolution, outreach drafts
- [ ] Run it on the real August 2026 GIS report and co-located battery report from Paul; tighten the co-located parser
- [ ] First pass of `resolve` on the top unresolved SPVs; build out `owner-aliases.csv`
- [ ] Load Zach's and Paul's LinkedIn exports; Baldwin + CAC account exports
- [ ] Review the first 100 with Paul: tune gates and exclusions

**Phase 2: The machine runs itself**
- [ ] Monthly scheduled run (ERCOT publishes monthly), with a digest of new triggers to Zach and Paul
- [ ] ZoomInfo API: verify the field mapping, then add scoops and intent to the dossier and ranking
- [ ] Lookalike search from the seeds (Nightpeak, Primergy, Avantus, "as they looked two years ago")
- [ ] Texas RRC bulk-download adapter (50-300 well operators)
- [ ] Pipeline-conversion economics (e.g., 400 MW/yr built out of a multi-GW pipeline)

**Phase 3: Beyond Texas and the flywheel**
- [ ] Other queues (SPP, MISO, CAISO, PJM) and an RNG project source
- [ ] Outcome tracking: meeting, submission, bound. Feed wins back into fly tuning.
- [ ] Codified team-sale playbook (find → meeting → info → close), with riscIQ as the retention layer
