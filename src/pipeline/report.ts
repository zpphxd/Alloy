import type { HuntResult, Target } from "./hunt.ts";
import { pipelineMw } from "../portfolio/aggregate.ts";

const usd = (n: number) =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}k` : `$${Math.round(n)}`;

function row(t: Target, i: number): string {
  const path = t.warmPath.paths[0];
  return [
    `### ${i + 1}. ${t.owner.name}${t.unresolved ? " _(owner unresolved: SPV/stem guess)_" : ""}`,
    `- **Fits:** ${t.flies.map((f) => f.flyId).join(", ")}`,
    `- **Portfolio:** ${t.summary.projectCount} projects · ${t.summary.mwByStage.operational} MW operating · ${pipelineMw(t.summary)} MW pipeline`,
    `- **Est. commission:** ${usd(t.economics.totalCommission)} (P&C ${usd(t.economics.pcCommission)}, tax ${usd(t.economics.taxCommission)}) · producer ≈ ${usd(t.economics.producerComp)}`,
    `- **CRM screen:** ${t.screen.status}${t.screen.matches.length ? ` (${t.screen.matches.map((m) => `${m.system}: ${m.accountName} / ${m.owner}`).join("; ")})` : ""}`,
    `- **Warm path:** ${path ? `${path.firstName} ${path.lastName}, ${path.position} (via ${path.via})` : "none found"}`,
    t.triggers.length ? `- **Triggers:**\n${t.triggers.map((x) => `  - ${x.kind}: ${x.detail}`).join("\n")}` : "- **Triggers:** none this cycle",
    `- **Why it passed:**\n${t.flies.flatMap((f) => f.reasons.map((r) => `  - [${f.flyId}] ${r}`)).join("\n")}`,
  ].join("\n");
}

export function toMarkdown(r: HuntResult, title: string, limit = 100): string {
  const t = r.targets.slice(0, limit);
  const total = t.reduce((s, x) => s + x.economics.totalCommission, 0);
  const intro =
    `${r.targets.length} targets passed at least one fly (showing ${t.length}). ${r.excluded.length} owners excluded. ` +
    `Est. commission across shown targets: ${usd(total)}. Economics use Paul's rules of thumb; see docs/BRIEF-2026-09-28.md.`;
  return [`# ${title}`, intro, ...t.map((x, i) => row(x, i))].join("\n\n") + "\n";
}

export function toCsv(r: HuntResult): string {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = [
    "owner", "unresolved", "flies", "projects", "operating_mw", "pipeline_mw", "est_commission",
    "est_producer_comp", "crm_status", "warm_path", "triggers",
  ];
  const lines = r.targets.map((t) =>
    [
      t.owner.name, t.unresolved, t.flies.map((f) => f.flyId).join("|"), t.summary.projectCount,
      t.summary.mwByStage.operational, pipelineMw(t.summary), Math.round(t.economics.totalCommission),
      Math.round(t.economics.producerComp), t.screen.status,
      t.warmPath.paths[0] ? `${t.warmPath.paths[0].firstName} ${t.warmPath.paths[0].lastName} (${t.warmPath.paths[0].via})` : "",
      t.triggers.map((x) => x.kind).join("|"),
    ].map(esc).join(","),
  );
  return [head.join(","), ...lines].join("\n");
}
