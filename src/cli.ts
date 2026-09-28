#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";
import { FLIES } from "../config/flies.ts";
import type { Stage, Technology } from "./domain/types.ts";
import { estimateProject } from "./economics/estimate.ts";
import { downloadLatest, GIS_REPORT_TYPE_ID, parseGisReport } from "./sources/ercot/gis-report.ts";
import { diffSnapshots } from "./triggers/diff.ts";
import { Store } from "./store/db.ts";
import { dossier, hunt } from "./pipeline/hunt.ts";
import { toCsv, toMarkdown } from "./pipeline/report.ts";
import { parseAliasCsv } from "./resolve/owner-resolver.ts";
import { resolveOwnerWithWeb } from "./resolve/claude-resolver.ts";
import { parseLinkedInConnections, type Connection } from "./route/warm-path.ts";
import { parseCrmCsv, type CrmAccount } from "./screen/crm-screen.ts";
import { qualify } from "./qualify/qualifier.ts";
import { draftOutreach } from "./outreach/draft.ts";

const HELP = `pescadora: hunt for exactly the clients we want

  ingest ercot [--file GIS_Report.xlsx]   Load the ERCOT GIS report (downloads the latest if no file),
                                          snapshot it, and diff against last month for triggers.
  hunt [--qualify N] [--limit N]          Resolve owners, match flies, screen, route. Writes
                                          data/out/hunt-<date>.{md,csv}. --qualify runs Claude on the top N.
  resolve [--top N]                       Web-research unresolved owners among the top N targets.
                                          Writes data/review/owner-findings.csv for a person to confirm.
  draft --owner "<name>" [--from "Zach Powers"]
                                          Draft (never send) a first-touch email for one target.
  econ --tech solar --mw 600 --stage construction
                                          Paul's back-of-napkin economics for one project.
  flies                                   List the target profiles.
`;

async function readIfExists(path: string): Promise<string | null> {
  return existsSync(path) ? readFile(path, "utf8") : null;
}

async function loadContext() {
  const aliases = parseAliasCsv((await readIfExists("config/owner-aliases.csv")) ?? "");
  const connections: Connection[] = [];
  if (existsSync("data/linkedin")) {
    for (const f of await readdir("data/linkedin")) {
      if (f.endsWith(".csv")) connections.push(...parseLinkedInConnections(await readFile(join("data/linkedin", f), "utf8"), basename(f, ".csv")));
    }
  }
  const crm: CrmAccount[] = [
    ...parseCrmCsv((await readIfExists("data/crm/baldwin.csv")) ?? "", "baldwin"),
    ...parseCrmCsv((await readIfExists("data/crm/cac.csv")) ?? "", "cac"),
  ];
  return { aliases, connections, crm };
}

function runHunt(store: Store, ctx: Awaited<ReturnType<typeof loadContext>>) {
  const [latest] = store.latestSnapshots("ercot_gis", 1);
  if (!latest) throw new Error("No ERCOT snapshot yet. Run: pescadora ingest ercot");
  return { latest, result: hunt({ projects: latest.projects, triggers: store.triggersFor(latest.id), ...ctx }) };
}

async function main() {
  const [cmd, sub, ...rest] = process.argv.slice(2);
  const store = () => new Store();

  switch (cmd) {
    case "ingest": {
      if (sub !== "ercot") throw new Error("Usage: pescadora ingest ercot [--file path]");
      const { values } = parseArgs({ args: rest, options: { file: { type: "string" } } });
      let bytes: Buffer;
      let label: string;
      if (values.file) {
        bytes = await readFile(values.file);
        label = basename(values.file);
      } else {
        const { doc, bytes: b } = await downloadLatest(GIS_REPORT_TYPE_ID, "GIS_Report");
        bytes = b;
        label = doc.friendlyName;
        await mkdir("data/raw", { recursive: true });
        await writeFile(join("data/raw", `${doc.constructedName}.xlsx`), b);
      }
      const projects = await parseGisReport(bytes);
      const s = store();
      const [prev] = s.latestSnapshots("ercot_gis", 1);
      const id = s.saveSnapshot("ercot_gis", label, projects);
      const triggers = prev ? diffSnapshots(prev.projects, projects) : [];
      s.saveTriggers(id, triggers);
      const counts = triggers.reduce<Record<string, number>>((m, t) => ((m[t.kind] = (m[t.kind] ?? 0) + 1), m), {});
      console.log(`Snapshot #${id} "${label}": ${projects.length} projects.`);
      console.log(prev ? `Triggers vs "${prev.label}": ${JSON.stringify(counts)}` : "First snapshot: triggers start next month.");
      break;
    }

    case "hunt": {
      const { values } = parseArgs({ args: [sub ?? "", ...rest].filter(Boolean), options: { qualify: { type: "string" }, limit: { type: "string" } } });
      const s = store();
      const { latest, result } = runHunt(s, await loadContext());
      const date = new Date().toISOString().slice(0, 10);
      await mkdir("data/out", { recursive: true });
      const md = toMarkdown(result, `Pescadora hunt: ${latest.label} (${date})`, Number(values.limit ?? 100));
      await writeFile(`data/out/hunt-${date}.md`, md);
      await writeFile(`data/out/hunt-${date}.csv`, toCsv(result));
      console.log(`${result.targets.length} targets, ${result.excluded.length} excluded. Report: data/out/hunt-${date}.md`);

      const n = Number(values.qualify ?? 0);
      for (const t of result.targets.slice(0, n)) {
        for (const g of t.flies) {
          const fly = FLIES.find((f) => f.id === g.flyId)!;
          const q = await qualify(fly, t.owner.id, dossier(t), s);
          console.log(`${q.verdict.toUpperCase().padEnd(3)} ${t.owner.name} / ${fly.id}: ${q.answer.summary}`);
        }
      }
      break;
    }

    case "resolve": {
      const { values } = parseArgs({ args: [sub ?? "", ...rest].filter(Boolean), options: { top: { type: "string" } } });
      const { result } = runHunt(store(), await loadContext());
      const todo = result.targets.filter((t) => t.unresolved).slice(0, Number(values.top ?? 10));
      const lines = ["match,owner_name,parent_name,confidence,evidence,source_urls,confirm(y/n)"];
      for (const t of todo) {
        const p = [...t.projects].sort((a, b) => b.capacityMw - a.capacityMw)[0]!;
        const f = await resolveOwnerWithWeb(p);
        console.log(`${t.owner.name} -> ${f.owner_name} (${f.confidence})`);
        const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
        lines.push([t.owner.aliases[0] ?? t.owner.name, f.owner_name, f.parent_name, f.confidence, f.evidence, f.source_urls.join(" "), ""].map(esc).join(","));
      }
      await mkdir("data/review", { recursive: true });
      await writeFile("data/review/owner-findings.csv", lines.join("\n"));
      console.log("Review data/review/owner-findings.csv; copy confirmed rows into config/owner-aliases.csv.");
      break;
    }

    case "draft": {
      const { values } = parseArgs({ args: [sub ?? "", ...rest].filter(Boolean), options: { owner: { type: "string" }, from: { type: "string" } } });
      if (!values.owner) throw new Error('Usage: pescadora draft --owner "<name>"');
      const { result } = runHunt(store(), await loadContext());
      const t = result.targets.find((x) => x.owner.name.toLowerCase().includes(values.owner!.toLowerCase()));
      if (!t) throw new Error(`No target matching "${values.owner}"`);
      const text = await draftOutreach({
        ownerName: t.owner.name,
        triggers: t.triggers,
        economics: t.economics,
        warmPath: t.warmPath,
        senderName: values.from ?? "Zach Powers",
      });
      await mkdir("data/outbox", { recursive: true });
      const file = `data/outbox/${t.owner.id.replace(/[^a-z0-9-]/gi, "_")}.md`;
      await writeFile(file, text);
      console.log(`${text}\n\n(Draft saved to ${file}. Review and send it yourself.)`);
      break;
    }

    case "econ": {
      const { values } = parseArgs({
        args: [sub ?? "", ...rest].filter(Boolean),
        options: { tech: { type: "string" }, mw: { type: "string" }, stage: { type: "string" } },
      });
      const e = estimateProject({
        technology: (values.tech ?? "solar") as Technology,
        capacityMw: Number(values.mw ?? 0),
        stage: (values.stage ?? "operational") as Stage,
      });
      console.log(JSON.stringify(e, null, 2));
      break;
    }

    case "flies":
      for (const f of FLIES) console.log(`${f.id.padEnd(24)} [${f.stream}] ${f.name}`);
      break;

    default:
      console.log(HELP);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
