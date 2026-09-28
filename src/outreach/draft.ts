import type { Trigger } from "../domain/types.ts";
import type { ProjectEconomics } from "../economics/estimate.ts";
import type { WarmPath } from "../route/warm-path.ts";
import { FALLBACK_BETA, MODEL, assertNotRefused, claude } from "../lib/claude.ts";

/**
 * Drafts only. A person reads, edits, and sends every message. Nothing in
 * Pescadora sends email or LinkedIn messages on its own: automated LinkedIn
 * messaging breaks LinkedIn's User Agreement and puts Paul's and Zach's
 * accounts (and their networks) at risk.
 *
 * Tone comes from Paul's feedback: the reader may be a 60-year-old risk
 * veteran, Goldman Sachs, or ArcLight. Write like an experienced broker, not
 * like marketing copy.
 */
const VOICE = `You draft first-touch outreach for a senior commercial insurance broker who specializes in renewable energy, battery storage, and energy infrastructure (builder's risk, operating P&C, tax credit insurance).

Voice: plain, specific, and brief, like a seasoned industry professional writing to a peer. No hype, no exclamation points, no buzzwords ("synergy", "leverage", "unlock", "game-changer"), no flattery. Lead with the one specific fact about their project that makes the note timely. Ask for one small thing (a 20-minute call). Under 120 words. If a mutual connection is provided, the note is for that connection to forward or to reference by name. Never invent facts that aren't in the brief.`;

export interface DraftBrief {
  ownerName: string;
  contactName?: string;
  contactTitle?: string;
  triggers: Trigger[];
  economics: ProjectEconomics;
  warmPath?: WarmPath;
  senderName: string;
}

export async function draftOutreach(b: DraftBrief): Promise<string> {
  const via = b.warmPath?.paths[0];
  const brief = [
    `Company: ${b.ownerName}`,
    b.contactName ? `Recipient: ${b.contactName}, ${b.contactTitle ?? ""}` : "Recipient: unknown, write a generic salutation",
    `Why now:\n${b.triggers.map((t) => `- ${t.detail}`).join("\n") || "- (no specific trigger)"}`,
    `Policies likely in play: ${b.economics.basis.join(", ") || "operating P&C"}`,
    via ? `Mutual connection: ${via.firstName} ${via.lastName} (${via.position}), connected to ${via.via}` : "Mutual connection: none",
    `Sender: ${b.senderName}`,
  ].join("\n");

  const msg = await claude().beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    output_config: { effort: "medium" },
    system: VOICE,
    messages: [{ role: "user", content: `<brief>\n${brief}\n</brief>\n\nWrite the email: a subject line, then the body.` }],
  });
  assertNotRefused(msg);
  return msg.content.flatMap((c) => (c.type === "text" ? [c.text] : [])).join("\n").trim();
}
