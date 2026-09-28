# Desktop handoff: first live Jev run, pull the back reports, fit the profile

**Jev is bolted in.** `@typesafe-ai/sdk` is installed, and Jev is the default qualifier (`src/qualify/jev-engine.ts`). It also ranks lookalike matches (`fit --jev`). It's tested against the real SDK with a stubbed network: 27 tests pass.

What the cloud session still couldn't do is anything live. Its network policy blocks `api.typesafe.ai` and `ercot.com`: the proxy refused the connection when we tried a live Jev call. So the first live Jev call, the back-report download, and the fit all happen here on desktop, or in the cloud once those hosts are allowed. To allow them in the cloud: session title bar → cloud environment → Edit → Network access, then add `api.typesafe.ai` and `www.ercot.com`. In the cloud, run Node commands with `NODE_USE_ENV_PROXY=1` so `fetch` goes through the proxy.

Read first: `docs/TARGET-PROFILE.md` (who we're hunting) and `docs/BRIEF-2026-09-28.md` (the source call).

## 0. Setup

```bash
git clone https://github.com/zpphxd/Alloy.git pescadora && cd pescadora
git checkout pescadora
npm install
cp .env.example .env
```

Fill in `.env`:
- `ANTHROPIC_API_KEY`
- `TYPESAFE_API_KEY`: **create a fresh Jev key and revoke the one pasted in chat.**
- `TYPESAFE_DEFAULT_MODEL`: set it after step 2

Check the build: `npm test` should show 27 passing, and `npm run typecheck` should be clean.

## 1. Pull the back reports (ERCOT GIS, report type 15933)

```bash
npm run pescadora -- backfill ercot --download
```

This lists every GIS report ERCOT still hosts, downloads each one to `data/raw/`, and loads them oldest first. Each month is diffed against the one before it, so the trigger history builds as it goes. It's safe to re-run: reports already loaded are skipped.

ERCOT's download site only keeps a limited window of history. For a true "two years ago" read, you need **reports from about 2023-2024 onward**. For anything older:
- Ask Paul. He's been pulling these by hand, and his `RPT.00015933…` file is one of them.
- Look for ERCOT's archive (the GIS Report page on ercot.com, and the ERCOT Public API archive for data product PG7-200-ER).
- Put the files in any folder and run `npm run pescadora -- backfill ercot --dir <folder>`. Dates are read from the file names.

## 2. First live Jev call

```bash
npx tsx -e 'import { TypeSafeClient } from "@typesafe-ai/sdk"; new TypeSafeClient().models.list().then((m) => console.log(m))'
```

This lists the models your key can use. Pin one of them in `.env` as `TYPESAFE_DEFAULT_MODEL` (instead of `jev-latest`) so verdicts don't shift when TypeSafe ships a new release. The model name is part of the qualifier's cache key, so changing it re-judges everyone.

How Jev is used:
- **Qualifier** (`src/qualify/jev-engine.ts`): the dossier is the state. Each rubric item is a yes/no question, and "major or subsidiary of one?" acts as a disqualifier. A target is a yes only when every required item is at ≥ 70% and it isn't a likely major.
- **Lookalike ranking** (`src/fit/jev-lookalike.ts`): each match is scored 0-4 on resemblance to the seed companies at the lookback date, plus P(early growth) and P(independent).

Claude still handles what Jev isn't built for: web research on owners (`resolve`) and outreach drafts.

## 3. Fit the profile to history

```bash
npm run pescadora -- resolve --top 25   # web-research SPV owners → data/review/owner-findings.csv
# Confirm the rows (especially Nightpeak / Primergy / Avantus SPVs) → append to config/owner-aliases.csv
npm run pescadora -- fit --lookback 24 --jev   # → data/out/fit-<date>.md, matches ranked by Jev
```

The fit report shows:
- each seed company's growth month by month, and its shape at the lookback point
- each seed project's size, technology, and months from filing to IA, to financial security, and to sync
- a **proposed `seed-lookalike` fly**, and who matches it today, ranked by Jev resemblance

Seed companies usually file under SPVs, so they only show up once their SPVs are in `owner-aliases.csv`. The fit step tells you which seeds it couldn't find.

**Review the proposed fly with Paul**, then paste it into `config/flies.ts`.

## 4. Hunt with Jev

```bash
npm run pescadora -- hunt --qualify 50   # Jev is the default qualifier
```

The output is `data/out/hunt-<date>.md` and `.csv`: ranked targets, fits, estimated commission, triggers, the CRM screen, and warm paths. LinkedIn exports (`data/linkedin/`) and ZoomInfo come next, per the plan.

## 5. Things to confirm with Paul

- Commission math: is 10% on P&C right, or does his "six million in commission" on the 600 MW example mean something else? (See the open question in the brief.)
- The co-located battery report: parse his file and tighten `src/sources/ercot/colocated.ts` to its real columns.
- Which of the seed projects are outside ERCOT, so we know which other queue to add first.

---

## Paste into Claude Code on desktop

```
We're on branch `pescadora` of this repo (Project Pescadora). Read HANDOFF.md,
docs/TARGET-PROFILE.md and docs/ARCHITECTURE.md first. TYPESAFE_API_KEY and
ANTHROPIC_API_KEY are in .env. Jev is already wired in as the qualifier.

1. Run the step-2 model list. Pin a dated Jev model in .env as TYPESAFE_DEFAULT_MODEL.
2. Run `npm run pescadora -- backfill ercot --download`, then tell me the date range loaded and
   whether it reaches back two years. If not, stop and tell me what's missing.
3. Run `resolve --top 25`, show me the owner findings to confirm, add the confirmed ones to
   config/owner-aliases.csv, then run `fit --lookback 24 --jev` and walk me through the proposed
   fly and the Jev ranking.
4. After I approve the fly, add it to config/flies.ts (keep Paul's quote in the rationale) and run
   `npm run pescadora -- hunt --qualify 50`.
Keep npm test and npm run typecheck green. Commit to `pescadora` as you go. Never commit anything
under data/ or any API key.
```
