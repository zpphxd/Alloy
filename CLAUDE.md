# Pescadora: notes for Claude

Read `docs/BRIEF-2026-09-28.md` first. It's the business intent. `docs/ARCHITECTURE.md` explains how the pieces fit.

- TypeScript, ESM, Node 22.13+. Run with `tsx`; there's no build step. Imports use `.ts` extensions.
- Check work with `npm test` and `npm run typecheck`.
- The core is deterministic code with tests (ingest, diff, gates, economics, screen, rank). Models sit at the edges: Jev (TypeSafe, via `src/lib/jev.ts`) for yes/no qualifying and lookalike scoring; Claude (via `src/lib/claude.ts`) for web research, drafting, and as the alternate qualifier.
- Tests never hit the network: Jev tests pass a stub `fetch` to a real `TypeSafeClient`, and Claude tests mock `src/lib/claude.ts`.
- Target profiles live in `config/flies.ts`. Keep Paul's quote in each `rationale` when changing numbers.
- The economics defaults are Paul's rules of thumb. `test/economics.test.ts` pins his worked examples. Update both together.
- Never commit anything under `data/`. It holds ZoomInfo data, LinkedIn exports, CRM exports, and drafts.
- Never add automated sending of email or LinkedIn messages. Outreach is drafts only.
