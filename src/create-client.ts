// ─────────────────────────────────────────────
//  FlexDB SDK · createClient
//  Recommended way to initialise the SDK.
//  Returns a fully-configured FlexDBClient.
// ─────────────────────────────────────────────

import { FlexDBClient } from "./client.ts";
import type { FlexDBClientOptions } from "./types.ts";

/**
 * Creates and returns a `FlexDBClient` instance.
 *
 * This is the recommended way to set up the SDK.
 * Call it once (e.g. in a module-level singleton) and reuse the client
 * across requests for maximum performance — especially important in
 * long-running servers and edge runtimes where cold-start cost matters.
 *
 * ---
 *
 * **Retry behaviour**
 *
 * By default the client retries failed requests up to **3 times** with a
 * **10 ms** delay between attempts. You can customise or disable this:
 *
 * ```ts
 * // Custom retry
 * createClient({ ..., retry: { times: 5, delay: 50 } });
 *
 * // Disable retries entirely
 * createClient({ ..., retry: false });
 * ```
 *
 * Retries only trigger for transient errors (network failures, HTTP 429, 5xx).
 * Client errors (4xx) are thrown immediately without retrying.
 *
 * ---
 *
 * @example — Basic setup
 * ```ts
 * import { createClient } from "flexdb-sdk";
 *
 * const db = createClient({
 *   apiKey:    process.env.FLEXDB_API_KEY!,
 *   baseUrl:   "https://eu.flex.arctics.dev",
 *   namespace: "users",          // optional default namespace
 * });
 *
 * const { key }  = await db.create({ name: "Alice", age: 30 });
 * const { item } = await db.get(key);
 * ```
 *
 * @example — Namespace binding
 * ```ts
 * const users    = db.namespace("users");
 * const products = db.namespace("products");
 *
 * await users.create({ name: "Bob" });
 * await products.create({ title: "Widget" }, { searchParams: { price: 9.99 } });
 * ```
 *
 * @example — Edge / serverless (one instance per module)
 * ```ts
 * // lib/db.ts — import this everywhere
 * export const db = createClient({
 *   apiKey:  process.env.FLEXDB_API_KEY!,
 *   baseUrl: process.env.FLEXDB_URL!,
 * });
 * ```
 */
export function createClient(options: FlexDBClientOptions): FlexDBClient {
  return new FlexDBClient(options);
}