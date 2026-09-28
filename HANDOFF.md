# Desktop handoff: bolt in Jev, pull the back reports, fit the profile

The cloud session couldn't finish three things:
- **Jev:** installing TypeSafe's SDK (`@typesafe-ai/sdk`) was blocked by the session's permission guard.
- **Network:** `typesafe.ai` and `ercot.com` were blocked by the environment's network policy.
- **Back reports:** without ERCOT access, there was nothing to download.

Everything else is built and tested on branch `pescadora`. On your desktop, run the steps below, or paste the prompt at the bottom into Claude Code and let it drive.

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
- `PESCADORA_QUALIFIER=jev`, once step 2 is done

Check the build: `npm test` should show 23 passing, and `npm run typecheck` should be clean.

## 1. Pull the back reports (ERCOT GIS, report type 15933)

```bash
npm run pescadora -- backfill ercot --download
```

This lists every GIS report ERCOT still hosts, downloads each one to `data/raw/`, and loads them oldest first. Each month is diffed against the one before it, so the trigger history builds as it goes. It's safe to re-run: reports already loaded are skipped.

ERCOT's download site only keeps a limited window of history. For a true "two years ago" read, you need **reports from about 2023-2024 onward**. For anything older:
- Ask Paul. He's been pulling these by hand, and his `RPT.00015933…` file is one of them.
- Look for ERCOT's archive (the GIS Report page on ercot.com, and the ERCOT Public API archive for data product PG7-200-ER).
- Put the files in any folder and run `npm run pescadora -- backfill ercot --dir <folder>`. Dates are read from the file names.

## 2. Bolt in Jev (the qualifier engine)

The qualifier already has a slot for it:
- `src/qualify/qualifier.ts` defines the `QualifierEngine` interface.
- `engineFromEnv()` throws a placeholder error for `PESCADORA_QUALIFIER=jev`.
- The verdict logic already honors probabilities: a required criterion counts only at ≥ 0.7.

1. Install the SDK: `npm i @typesafe-ai/sdk`.
   - Official package: `@typesafe-ai/sdk`, repo `github.com/typesafe-ai/typesafe-sdk-js`, docs at `docs.typesafe.ai`.
   - Several look-alike "Jev" sites showed up in search (jevapi.dev, jevai.org, jevwiki.ai). Use only the official ones.
2. Read the SDK's type definitions and README. Don't guess the API.
3. Create `src/qualify/jev-engine.ts`, exporting a `QualifierEngine` with `id: "jev:<model>"`:
   - **State** = the target dossier (`dossier()` in `src/pipeline/hunt.ts`) plus the fly's name and description.
   - **Questions** = one yes/no question per `fly.rubric` item, keyed by the item's `id`, plus one question: "Is this owner a major or a subsidiary of one?" A "yes" there becomes a disqualifier.
   - **Answers**: map to `CriterionAnswer { id, met, probability, evidence }`, where `evidence` is Jev's confidence.
   - **Summary**: build it in code from the answers. Jev doesn't write prose.
4. Wire it into `engineFromEnv()` and add `test/jev-engine.test.ts`, mocking the SDK the same way `test/qualifier.test.ts` mocks Claude.
5. Optional: add a Jev **score** question for the fit step: "How closely does this portfolio match `<seed>` at `<lookback date>`?" (0-1). Use it to rank the `seed-lookalike` matches.

Claude stays in place for what Jev isn't built for: web research on owners (`resolve`) and outreach drafts.

## 3. Fit the profile to history

```bash
npm run pescadora -- resolve --top 25   # web-research SPV owners → data/review/owner-findings.csv
# Confirm the rows (especially Nightpeak / Primergy / Avantus SPVs) → append to config/owner-aliases.csv
npm run pescadora -- fit --lookback 24  # → data/out/fit-<date>.md
```

The fit report shows:
- each seed company's growth month by month, and its shape at the lookback point
- each seed project's size, technology, and months from filing to IA, to financial security, and to sync
- a **proposed `seed-lookalike` fly**, and who matches it today

Seed companies usually file under SPVs, so they only show up once their SPVs are in `owner-aliases.csv`. The fit step tells you which seeds it couldn't find.

**Review the proposed fly with Paul**, then paste it into `config/flies.ts`.

## 4. Hunt with Jev

```bash
PESCADORA_QUALIFIER=jev npm run pescadora -- hunt --qualify 50
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
docs/TARGET-PROFILE.md and docs/ARCHITECTURE.md first.

1. Install @typesafe-ai/sdk (official package, repo github.com/typesafe-ai/typesafe-sdk-js).
   Read its type definitions and README. Do not guess the API.
2. Implement src/qualify/jev-engine.ts as a QualifierEngine (see src/qualify/qualifier.ts):
   dossier = state, one yes/no question per rubric item plus a "major or subsidiary?"
   disqualifier, probabilities mapped into CriterionAnswer. Wire it into engineFromEnv() for
   PESCADORA_QUALIFIER=jev. Add test/jev-engine.test.ts with the SDK mocked. Keep npm test and
   npm run typecheck green. TYPESAFE_API_KEY is in .env.
3. Run `npm run pescadora -- backfill ercot --download`, then tell me the date range loaded and
   whether it reaches back two years. If not, stop and tell me what's missing.
4. Run `resolve --top 25`, show me the owner findings to confirm, add the confirmed ones to
   config/owner-aliases.csv, then run `fit --lookback 24` and walk me through the proposed fly.
5. After I approve the fly, add it to config/flies.ts and run
   `PESCADORA_QUALIFIER=jev npm run pescadora -- hunt --qualify 50`.
Commit to `pescadora` as you go. Never commit anything under data/ or any API key.
```
