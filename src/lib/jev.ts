import { TypeSafeClient, type TypeSafeClientConfig } from "@typesafe-ai/sdk";

/**
 * One place for TypeSafe/Jev config. The SDK reads TYPESAFE_API_KEY and
 * TYPESAFE_DEFAULT_MODEL (default "jev-latest"). For verdicts that stay
 * reproducible across Jev releases, pin TYPESAFE_DEFAULT_MODEL to a dated
 * model from `client.models.list()`. The model name is part of the
 * qualifier's cache key.
 */
let client: TypeSafeClient | undefined;

export function jev(config?: TypeSafeClientConfig): TypeSafeClient {
  if (config) return new TypeSafeClient(config);
  client ??= new TypeSafeClient();
  return client;
}
