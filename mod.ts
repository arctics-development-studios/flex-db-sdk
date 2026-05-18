/**
 * # FlexDB SDK
 *
 * Type-safe, zero-dependency JavaScript / TypeScript client for **FlexDB** —
 * a high-performance key-value Database-as-an-API with automatic storage tiering.
 * Works in Cloudflare Workers, Vercel Edge, Deno, Bun, and Node.js ≥ 18.
 *
 * ## Installation
 *
 * ```ts
 * // deno.json
 * {
 *   "imports": {
 *     "@arctics/flex-db-sdk": "jsr:@arctics/flex-db-sdk@^2.5.0"
 *   }
 * }
 * ```
 *
 * ## Quick start
 *
 * ```ts
 * import { createClient } from "@arctics/flex-db-sdk";
 *
 * const db = createClient({
 *   apiKey:    Deno.env.get("FLEXDB_API_KEY")!,
 *   baseUrl:   "https://eu.flex.arctics.dev",
 *   namespace: "users",
 * });
 *
 * await db.set("user:42", { name: "Alice", score: 9001 }, { sp: { score: 9001 } });
 * const { data, meta } = await db.get<{ name: string; score: number }>("user:42");
 * await db.delete("user:42");
 * ```
 *
 * ## Namespace binding
 *
 * ```ts
 * const users = db.namespace("users");
 * await users.set("user:42", { name: "Alice" });
 * const { data } = await users.get("user:42");
 * ```
 *
 * ## Filtering — `search`
 *
 * ```ts
 * await db.set("user:42", { name: "Alice" }, {
 *   namespace: "users",
 *   sp: { score: 9001, role: "admin" },
 * });
 *
 * const { keys } = await db.search({
 *   namespace: "users",
 *   filters: {
 *     score: { gte: 1000 },
 *     role:  { eq: "admin" },
 *   },
 * });
 * ```
 *
 * ## Pagination
 *
 * ```ts
 * import { paginateList } from "@arctics/flex-db-sdk";
 *
 * for await (const page of paginateList(db, { namespace: "users", limit: 100 })) {
 *   console.log(page.data);    // string[]
 *   console.log(page.hasMore);
 * }
 * ```
 *
 * ## Error handling
 *
 * ```ts
 * import { FlexDBError, FlexDBNetworkError } from "@arctics/flex-db-sdk";
 *
 * try {
 *   await db.get("missing-key", { namespace: "users" });
 * } catch (err) {
 *   if (err instanceof FlexDBError) {
 *     console.error(err.code, err.status, err.message);
 *   } else if (err instanceof FlexDBNetworkError) {
 *     console.error("Network error:", err.cause);
 *   }
 * }
 * ```
 *
 * @module
 */

// ── Client ─────────────────────────────────────────────────────────────────

export { FlexDBClient, NamespacedClient } from "./src/client.ts";
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

  // Metadata
  ObjectMeta,

  // Bulk operation items
  BulkCreateItem,
  BulkSetItem,

  // Results
  HealthResult,
  SetResult,
  GetResult,
  DeleteResult,
  ListIdsResult,
  ListItemsResult,
  ListResult,
  BulkGetItem,
  BulkGetResult,
  BulkCreateResultItem,
  BulkCreateResult,
  BulkSetResultItem,
  BulkSetResult,
  BulkDeleteResult,
} from "./src/types.ts";

// ── Errors ─────────────────────────────────────────────────────────────────

export { FlexDBError, FlexDBNetworkError } from "./src/types.ts";
