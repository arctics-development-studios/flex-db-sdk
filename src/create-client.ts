/**
 * # Client Factory
 *
 * Recommended entry-point for creating a FlexDB client instance.
 *
 * The {@link createClient} function is the primary way to initialize the SDK.
 * Call it once at module scope and reuse the same instance across your application
 * for maximum performance and connection pooling.
 *
 * ```ts
 * import { createClient } from "@arctics/flex-db-sdk";
 *
 * const db = createClient({
 *   apiKey:  Deno.env.get("FLEXDB_API_KEY")!,
 *   baseUrl: "https://eu.flex.arctics.dev",
 *   namespace: "users", // optional default
 * });
 *
 * // Use everywhere in your app
 * export { db };
 * ```
 *
 * @module
 */

// ─────────────────────────────────────────────
//  FlexDB SDK · createClient
//  Recommended way to initialise the SDK.
//  Returns a fully-configured FlexDBClient.
// ─────────────────────────────────────────────

import { FlexDBClient } from "./client.ts";
import type { FlexDBClientOptions } from "./types.ts";

/**
 * Creates and returns a {@link FlexDBClient} instance.
 *
 * This is the **recommended** way to initialise the SDK. Call it once —
 * ideally at module scope — and reuse the same client across all requests.
 * A singleton client maximises TCP keep-alive reuse and avoids unnecessary
 * overhead in long-running servers and edge runtimes.
 *
 * ---
 *
 * ### Retry behaviour
 *
 * By default the client retries failed requests up to **3 times** with a
 * **10 ms** delay between attempts. Only transient errors are retried:
 * network failures, HTTP `429`, and HTTP `5xx`. Client errors (`4xx`) and
 * aborted requests are thrown immediately.
 *
 * ---
 *
 * @param options - Configuration for the client. See {@link FlexDBClientOptions}.
 * @returns A fully-configured {@link FlexDBClient} ready to use.
 *
 * @example Basic setup
 * ```ts
 * import { createClient } from "@arctics/flex-db-sdk";
 *
 * const db = createClient({
 *   apiKey:    Deno.env.get("FLEXDB_API_KEY")!,
 *   baseUrl:   "https://eu.flex.arctics.dev",
 *   namespace: "users", // optional default namespace
 * });
 *
 * const { key }  = await db.create({ name: "Alice", age: 30 });
 * const { item } = await db.get(key);
 * ```
 *
 * @example Custom retry
 * ```ts
 * const db = createClient({
 *   apiKey:  Deno.env.get("FLEXDB_API_KEY")!,
 *   baseUrl: "https://eu.flex.arctics.dev",
 *   retry:   { times: 5, delay: 50 },
 * });
 * ```
 *
 * @example Disable retries entirely
 * ```ts
 * const db = createClient({
 *   apiKey:  Deno.env.get("FLEXDB_API_KEY")!,
 *   baseUrl: "https://eu.flex.arctics.dev",
 *   retry:   false,
 * });
 * ```
 *
 * @example Namespace binding
 * ```ts
 * const users    = db.namespace("users");
 * const products = db.namespace("products");
 *
 * await users.create({ name: "Bob" });
 * await products.create({ title: "Widget" }, { searchParams: { price: 9.99 } });
 * ```
 *
 * @example Singleton for edge / serverless (recommended pattern)
 * ```ts
 * // lib/db.ts — import this everywhere instead of calling createClient repeatedly
 * import { createClient } from "@arctics/flex-db-sdk";
 *
 * export const db = createClient({
 *   apiKey:  Deno.env.get("FLEXDB_API_KEY")!,
 *   baseUrl: Deno.env.get("FLEXDB_URL")!,
 * });
 * ```
 */
export function createClient(options: FlexDBClientOptions): FlexDBClient {
  return new FlexDBClient(options);
}