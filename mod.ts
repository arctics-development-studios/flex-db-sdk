/**
 * # FlexDB SDK
 *
 * Type-safe, zero-dependency JavaScript / TypeScript client for **FlexDB** —
 * a high-performance distributed cache and key-value store with seamless
 * multi-tier data orchestration. Works in Cloudflare Workers, Vercel Edge,
 * Deno, Bun, and Node.js ≥ 18.
 *
 * ## Installation
 *
 * ```ts
 * // deno.json
 * {
 *   "imports": {
 *     "@arctics/flex-db-sdk": "jsr:@arctics/flex-db-sdk@^1.0.2"
 *   }
 * }
 * // package.json
 * {
 *   "dependencies": {
 *     "@arctics/flex-db-sdk": "jsr:@arctics/flex-db-sdk@^1.0.2"
 *   }
 * }
 * ```
 *
 * ## Quick start — create a client
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
 * const { key }  = await db.create({ name: "Alice", age: 30 });
 * const { item } = await db.get<{ name: string; age: number }>(key);
 * await db.delete(key);
 * ```
 *
 * ## Writing and reading — `create`, `set`, `get`
 *
 * ```ts
 * // Create with server-generated key
 * const { key } = await db.create({ name: "Bob", age: 25 });
 *
 * // Upsert with your own key
 * await db.set("user-42", { name: "Carol", age: 35 });
 *
 * // Retrieve by key
 * const { item } = await db.get<User>("user-42");
 * ```
 *
 * ## Namespace binding — scope to a collection
 *
 * ```ts
 * const users    = db.namespace("users");
 * const products = db.namespace("products");
 *
 * const { key }  = await users.create({ name: "Alice" });
 * const { item } = await users.get<User>(key);
 * ```
 *
 * ## Listing items — `list` and `paginateList`
 *
 * ```ts
 * import { paginateList } from "@arctics/flex-db-sdk";
 *
 * // Fetch IDs page-by-page
 * for await (const page of paginateList(db, { namespace: "users", limit: 50 })) {
 *   console.log(page.data);    // string[]
 *   console.log(page.hasMore); // false on the last page
 * }
 *
 * // Or get full objects (limit ≤ 20)
 * for await (const page of paginateListHydrated<User>(db, { namespace: "users", limit: 20 })) {
 *   for (const { id, data } of page.data) console.log(id, data?.name);
 * }
 * ```
 *
 * ## Filtering — `search` and `paginateSearch`
 *
 * Index fields at write-time, then query them later:
 *
 * ```ts
 * // Write with indexed fields
 * const { key } = await db.create(
 *   { title: "Widget Pro", price: 49.99 },
 *   { namespace: "products", searchParams: { price: 49.99, category: "electronics" } },
 * );
 *
 * // Filter on those fields
 * const { ids } = await db.search({
 *   namespace: "products",
 *   filters: {
 *     price:    { gte: 10, lte: 100 },
 *     category: { eq: "electronics" },
 *   },
 * });
 * ```
 *
 * ## Error handling
 *
 * Every operation throws either {@link FlexDBError} (server error)
 * or {@link FlexDBNetworkError} (network failure):
 *
 * ```ts
 * import { FlexDBError, FlexDBNetworkError } from "@arctics/flex-db-sdk";
 *
 * try {
 *   const { item } = await db.get("missing-key");
 * } catch (err) {
 *   if (err instanceof FlexDBError) {
 *     console.error(err.status, err.message, err.body);
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