/**
 * # Flex-DB SDK
 *
 * Type-safe, zero-dependency JavaScript / TypeScript client for **Flex-DB** —
 * a high-performance distributed cache, key-value and cold data store with seamless integration. Works in Cloudflare Workers,
 * Vercel Edge, Deno, Bun, and Node.js ≥ 18.
 *
 * ## Quick start
 *
 * ```ts
 * import { createClient } from "@arctics/flex-db-sdk";
 *
 * const db = createClient({
 *   apiKey:    Deno.env.get("FLEXDB_API_KEY")!,  // Required
 *   baseUrl:   "https://eu.flex.arctics.dev",    // Optional, defaults to global endpoint
 *   namespace: "users",                          // Optional, can be overridden per-operation
 * });
 *
 * const { key }  = await db.create({ name: "Alice", age: 30 });
 * const { item } = await db.get<{ name: string; age: number }>(key);
 * await db.delete(key);
 * ```
 *
 * ## Namespace binding
 *
 * ```ts
 * const users = db.namespace("users");
 * const { key }  = await users.create({ name: "Bob" });
 * const { item } = await users.get<User>(key);
 * ```
 *
 * ## Paginated listing
 *
 * ```ts
 * import { paginateList } from "@arctics/flex-db-sdk";
 *
 * for await (const page of paginateList(db, { namespace: "users", limit: 50 })) {
 *   console.log(page.data);    // string[]
 *   console.log(page.hasMore); // false on the last page
 * }
 * ```
 *
 * ## Error handling
 *
 * ```ts
 * import { FlexDBError, FlexDBNetworkError } from "@arctics/flex-db-sdk";
 *
 * try {
 *   const { item } = await db.get("missing-key");
 * } catch (err) {
 *   if (err instanceof FlexDBError) {
 *     console.error(err.status, err.message);
 *   } else if (err instanceof FlexDBNetworkError) {
 *     console.error("Network error:", err.cause);
 *   }
 * }
 * ```
 *
 * @module
 */

// ─────────────────────────────────────────────
//  FlexDB SDK · Public API
//  Import everything you need from this one file.
// ─────────────────────────────────────────────

// ── Client ─────────────────────────────────────────────────────────────────

export { FlexDBClient, NamespacedClient } from "./src/client.ts";

// ── Factory (recommended entry-point) ─────────────────────────────────────

export { createClient } from "./src/create-client.ts";

// ── Pagination ─────────────────────────────────────────────────────────────

export {
  Paginator,
  paginateList,
  paginateListHydrated,
  paginateSearch,
  paginateSearchHydrated,
} from "./src/paginator.ts";
export type { Page } from "./src/paginator.ts";

// ── Types ──────────────────────────────────────────────────────────────────

export type {
  // Config
  RetryConfig,
  FlexDBClientOptions,

  // Operation options
  OperationOptions,
  SetOptions,
  GetOptions,
  DeleteOptions,
  ListOptions,
  SearchOptions,

  // Data shapes
  SearchParams,
  Filters,
  FilterOperators,

  // Results
  CreateResult,
  SetResult,
  GetResult,
  DeleteResult,
  ListIdsResult,
  ListItemsResult,
  ListResult,
} from "./src/types.ts";

// ── Errors ─────────────────────────────────────────────────────────────────

export { FlexDBError, FlexDBNetworkError } from "./src/types.ts";