import Anthropic from "@anthropic-ai/sdk";

/**
 * One place for model config. Every Claude call in Pescadora goes through the
 * beta Messages endpoint so it can opt into server-side refusal fallbacks
 * (`fallbacks: "default"`); a declined request is retried on Anthropic's
 * recommended fallback model instead of failing the run.
 */
export const MODEL = process.env.PESCADORA_MODEL ?? "claude-opus-5-5";
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

let client: Anthropic | undefined;
export function claude(): Anthropic {
  client ??= new Anthropic();
  return client;
}

export class RefusalError extends Error {
  constructor(public category: string | null | undefined, explanation: string | null | undefined) {
    super(`Claude declined (${category ?? "unspecified"}): ${explanation ?? ""}`);
  }
}

export function assertNotRefused(msg: Anthropic.Beta.BetaMessage): void {
  if (msg.stop_reason === "refusal") {
    throw new RefusalError(msg.stop_details?.category, msg.stop_details?.explanation);
  }
}
