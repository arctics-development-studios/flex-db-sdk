/**
 * All public-facing TypeScript contracts for the FlexDB SDK.
 *
 * This module is re-exported from the root {@link https://jsr.io/@arctics/flex-db-sdk | @arctics/flex-db-sdk}
 * entry-point — you rarely need to import from here directly.
 *
 * @module
 */

// ─────────────────────────────────────────────
//  FlexDB SDK · Types
//  All public-facing TypeScript contracts live here.
// ─────────────────────────────────────────────

// ── Retry ──────────────────────────────────────────────────────────────────

/**
 * Controls how the SDK re-attempts failed requests.
 * Configure once when calling {@link createClient}.
 *
 * Only transient errors are retried — see the table below:
 *
 * | Scenario                | Retried? |
 * |-------------------------|----------|
 * | Network failure         | ✅        |
 * | HTTP 429 (rate limit)   | ✅        |
 * | HTTP 5xx (server error) | ✅        |
 * | HTTP 4xx (client error) | ❌        |
 * | `AbortSignal` fired     | ❌        |
 *
 * @example Aggressive retry for high-traffic services
 * ```ts
 * const db = createClient({
 *   apiKey:  "...",
 *   baseUrl: "https://eu.flex.arctics.dev",
 *   retry:   { times: 5, delay: 50 },
 * });
 * ```
 *
 * @example Disable retries entirely
 * ```ts
 * const db = createClient({
 *   apiKey:  "...",
 *   baseUrl: "https://eu.flex.arctics.dev",
 *   retry:   false,
 * });
 * ```
 */
export interface RetryConfig {
  /**
   * Maximum number of retry attempts **after** the first failure.
   * `0` means no retries; the maximum accepted value is `10`.
   * Values outside this range are clamped automatically.
   * @default 3
   */
  times: number;

  /**
   * Fixed delay in milliseconds between each retry attempt.
   * @default 10
   */
  delay: number;
}

// ── Client ─────────────────────────────────────────────────────────────────

/**
 * Options passed to {@link createClient} to configure a {@link FlexDBClient}.
 *
 * @example Minimal configuration
 * ```ts
 * import { createClient } from "@arctics/flex-db-sdk";
 *
 * const db = createClient({
 *   apiKey:  Deno.env.get("FLEXDB_API_KEY")!,
 *   baseUrl: "https://eu.flex.arctics.dev",
 * });
 * ```
 *
 * @example Full configuration with namespace and retry
 * ```ts
 * const db = createClient({
 *   apiKey:    Deno.env.get("FLEXDB_API_KEY")!,
 *   baseUrl:   "https://eu.flex.arctics.dev",
 *   namespace: "users",
 *   retry:     { times: 5, delay: 50 },
 * });
 * ```
 */
export interface FlexDBClientOptions {
  /**
   * Your JWT API key.
   * Sent as `Authorization: Bearer <apiKey>` on every request.
   *
   * Keep this secret — never commit it to source control.
   * Use environment variables instead:
   * ```ts
   * apiKey: Deno.env.get("FLEXDB_API_KEY")!
   * ```
   */
  apiKey: string;

  /**
   * Base URL of your FlexDB service instance.
   * Trailing slashes are stripped automatically.
   * @example "https://eu.flex.arctics.dev"
   */
  baseUrl: string;

  /**
   * Default namespace (collection) applied to every operation.
   * Can be overridden per-call via the `namespace` field in any
   * {@link OperationOptions} subtype, or replaced entirely by using
   * {@link FlexDBClient.namespace} to create a bound client.
   *
   * @example
   * ```ts
   * // Set once — every call uses "users" unless overridden
   * const db = createClient({ ..., namespace: "users" });
   * await db.create({ name: "Alice" }); // → stored in "users"
   * await db.create({ sku: "W1" }, { namespace: "products" }); // override
   * ```
   */
  namespace?: string;

  /**
   * Retry behaviour for transient request failures.
   * Pass `false` to disable retries entirely.
   *
   * See {@link RetryConfig} for available options.
   * @default \{ times: 3, delay: 10 \}
   */
  retry?: RetryConfig | false;
}

// ── Namespace ──────────────────────────────────────────────────────────────

/**
 * Base options accepted by every CRUD and query operation.
 *
 * These fields let you override client-level defaults for a single call
 * without creating a new client instance.
 */
export interface OperationOptions {
  /**
   * Namespace (collection) for this specific call.
   * Overrides the client-level default set in {@link FlexDBClientOptions.namespace}.
   *
   * @example
   * ```ts
   * // Client default is "users", but write to "admins" just this once
   * await db.create({ name: "Carol" }, { namespace: "admins" });
   * ```
   */
  namespace?: string;

  /**
   * An `AbortSignal` to cancel this request.
   * When the signal fires, the in-flight fetch is aborted immediately and
   * an `AbortError` is thrown — retries are **not** attempted.
   *
   * Compatible with `AbortController` in Cloudflare Workers, Vercel Edge,
   * Deno, Bun, and Node.js ≥ 15.
   *
   * @example
   * ```ts
   * const controller = new AbortController();
   * setTimeout(() => controller.abort(), 3_000); // 3 s timeout
   *
   * const { item } = await db.get("some-key", { signal: controller.signal });
   * ```
   */
  signal?: AbortSignal;
}

// ── Search Params ─────────────────────────────────────────────────────────

/**
 * A flat key-value map of fields to index at write-time.
 *
 * Pass this as `searchParams` when calling {@link FlexDBClient.create} or
 * {@link FlexDBClient.set}. The values are stored in the search index and
 * can later be queried with {@link FlexDBClient.search} using
 * {@link FilterOperators}.
 *
 * All values must be JSON-serialisable primitives or arrays thereof.
 *
 * @example
 * ```ts
 * // Index these fields at write-time…
 * await db.create(
 *   { title: "Widget Pro", price: 49.99 },
 *   { searchParams: { price: 49.99, category: "electronics", inStock: true } },
 * );
 *
 * // …then filter on them later
 * const { ids } = await db.search({
 *   filters: { price: { lte: 100 }, inStock: { eq: true } },
 * });
 * ```
 */
export type SearchParams = Record<string, string | number | boolean | null | (string | number | boolean | null)[]>;

// ── Filter Operators ───────────────────────────────────────────────────────

/**
 * Comparison and membership operators used inside {@link Filters}.
 *
 * Combine multiple operators on a single field to express range queries:
 *
 * ```ts
 * // Price between 10 and 100 (inclusive)
 * price: { gte: 10, lte: 100 }
 * ```
 *
 * @example All available operators
 * ```ts
 * await db.search({
 *   namespace: "products",
 *   filters: {
 *     price:    { gte: 10, lte: 100 },   // range
 *     category: { eq: "electronics" },   // exact match
 *     sku:      { sw: "WIDGET-" },        // starts with
 *     tags:     { inc: "sale" },          // array includes
 *     rating:   { neq: null },            // not null
 *     discount: { ex: true },             // field exists
 *   },
 * });
 * ```
 */
export interface FilterOperators<T = any> {
  /** Exact match — equivalent to `field === value`. */
  eq?: T;
  /** Not equal — equivalent to `field !== value`. */
  neq?: T;
  /** Greater than — equivalent to `field > value`. */
  gt?: T;
  /** Greater than or equal — equivalent to `field >= value`. */
  gte?: T;
  /** Less than — equivalent to `field < value`. */
  lt?: T;
  /** Less than or equal — equivalent to `field <= value`. */
  lte?: T;
  /** String contains (substring check) or array includes the given value. */
  inc?: T;
  /** String starts with the given prefix. */
  sw?: T;
  /**
   * Attribute existence check.
   * `true` → field must exist; `false` → field must not exist.
   */
  ex?: boolean;
}

/**
 * Typed filter map for {@link FlexDBClient.search}.
 *
 * Each key corresponds to a field you previously indexed via `searchParams`.
 * The value is a {@link FilterOperators} object describing the predicate.
 *
 * Type-safe when you supply your `SearchParams` interface as the generic `SP`:
 *
 * ```ts
 * interface ProductSP {
 *   price:    number;
 *   category: string;
 *   inStock:  boolean;
 * }
 *
 * // TypeScript validates both key names and operator value types
 * const filters: Filters<ProductSP> = {
 *   price:    { gte: 10, lte: 100 },
 *   category: { eq: "electronics" },
 *   inStock:  { eq: true },
 * };
 * ```
 */
export type Filters<SP extends SearchParams = SearchParams> = {
  [K in keyof SP]?: FilterOperators<SP[K]>;
};

// ── CRUD Inputs ────────────────────────────────────────────────────────────

/**
 * Options for {@link FlexDBClient.create} and {@link FlexDBClient.set}.
 *
 * Extends {@link OperationOptions} with an optional `searchParams` field
 * for indexing fields at write-time.
 *
 * @example
 * ```ts
 * await db.set("user-42", { name: "Bob", age: 25 }, {
 *   namespace:    "users",
 *   searchParams: { age: 25, role: "viewer" },
 * });
 * ```
 */
export interface SetOptions<SP extends SearchParams = SearchParams> extends OperationOptions {
  /**
   * Fields to index for future {@link FlexDBClient.search} calls.
   * Values are stored separately from the item data and power all filter queries.
   */
  searchParams?: SP;
}

/** Options for {@link FlexDBClient.get}. Inherits {@link OperationOptions}. */
export interface GetOptions extends OperationOptions {}

/** Options for {@link FlexDBClient.delete}. Inherits {@link OperationOptions}. */
export interface DeleteOptions extends OperationOptions {}

// ── List / Search ─────────────────────────────────────────────────────────

/**
 * Options for {@link FlexDBClient.list}.
 *
 * @example Paginate manually
 * ```ts
 * let cursor: string | undefined;
 * do {
 *   const result = await db.list({ namespace: "users", limit: 50, cursor });
 *   console.log(result.ids);
 *   cursor = result.nextCursor;
 * } while (cursor);
 * ```
 *
 * @example Return full objects instead of IDs (limit must be ≤ 20)
 * ```ts
 * const { items } = await db.list<User>({ namespace: "users", hydrate: true, limit: 20 });
 * for (const { id, data } of items) {
 *   console.log(id, data?.name);
 * }
 * ```
 */
export interface ListOptions extends OperationOptions {
  /**
   * Maximum number of results to return per page.
   * Hard limit: 100. When `hydrate: true`, hard limit is 20.
   * @default 20
   */
  limit?: number;
  /**
   * Opaque pagination cursor returned as `nextCursor` from the previous call.
   * Omit (or pass `undefined`) to start from the beginning.
   */
  cursor?: string;
  /**
   * When `true`, each result includes the full stored object instead of just its ID.
   * **Only available when `limit` is ≤ 20** (server constraint).
   * Changes the response type from {@link ListIdsResult} to {@link ListItemsResult}.
   */
  hydrate?: boolean;
}

/**
 * Options for {@link FlexDBClient.search}.
 *
 * Extends {@link ListOptions} with a required `filters` field.
 *
 * @example
 * ```ts
 * const { ids } = await db.search({
 *   namespace: "products",
 *   filters: {
 *     price:    { gte: 10, lte: 50 },
 *     category: { eq: "books" },
 *   },
 *   limit: 25,
 * });
 * ```
 */
export interface SearchOptions<SP extends SearchParams = SearchParams> extends ListOptions {
  /**
   * Filter expressions evaluated server-side against the indexed `searchParams`.
   * See {@link Filters} and {@link FilterOperators} for the full operator reference.
   */
  filters: Filters<SP>;
}

// ── Responses ─────────────────────────────────────────────────────────────

/**
 * Returned by {@link FlexDBClient.create}.
 *
 * @example
 * ```ts
 * const result: CreateResult = await db.create({ name: "Alice" });
 * console.log(result.key); // "V1StGXR8_Z5jdHi6B-myT" (NanoID)
 * ```
 */
export interface CreateResult {
  success: true;
  /**
   * Server-generated NanoID key for the newly created item.
   * Store this key — it is the only way to retrieve or delete the item later.
   */
  key: string;
}

/**
 * Returned by {@link FlexDBClient.set}.
 *
 * @example
 * ```ts
 * const result: SetResult = await db.set("my-key", { name: "Bob" });
 * console.log(result.key); // "my-key"
 * ```
 */
export interface SetResult {
  success: true;
  /** The caller-supplied key used to store the item. */
  key: string;
}

/**
 * Returned by {@link FlexDBClient.get}.
 *
 * @example
 * ```ts
 * const { item } = await db.get<User>("abc123");
 * console.log(item.name); // "Alice"
 * ```
 */
export interface GetResult<T = unknown> {
  success: true;
  /** The stored item, deserialised as type `T`. */
  item: T;
}

/**
 * Returned by {@link FlexDBClient.delete}.
 *
 * @example
 * ```ts
 * const { success } = await db.delete("abc123");
 * console.log(success); // true
 * ```
 */
export interface DeleteResult {
  success: true;
}

/**
 * Returned by {@link FlexDBClient.list} and {@link FlexDBClient.search}
 * when `hydrate` is `false` (the default).
 *
 * @example
 * ```ts
 * const { ids, nextCursor } = await db.list({ namespace: "users", limit: 50 });
 * console.log(ids);        // ["abc", "def", ...]
 * console.log(nextCursor); // "eyJrZXkiOi..." or undefined (last page)
 * ```
 */
export interface ListIdsResult {
  /** Array of item keys on this page. */
  ids: string[];
  /**
   * Pass this token as `cursor` in the next call to fetch the following page.
   * `undefined` indicates there are no more pages.
   */
  nextCursor?: string;
}

/**
 * Returned by {@link FlexDBClient.list} and {@link FlexDBClient.search}
 * when `hydrate: true` is set. Requires `limit` ≤ 20.
 *
 * @example
 * ```ts
 * const { items } = await db.list<User>({ hydrate: true, limit: 20 });
 * for (const { id, data } of items) {
 *   console.log(id, data?.name); // data is null if the item was deleted mid-page
 * }
 * ```
 */
export interface ListItemsResult<T = unknown> {
  /** Array of `{ id, data }` pairs on this page. `data` may be `null` if an item was concurrently deleted. */
  items: { id: string; data: T | null }[];
  /**
   * Pass this token as `cursor` in the next call to fetch the following page.
   * `undefined` indicates there are no more pages.
   */
  nextCursor?: string;
}

/**
 * Conditional helper that resolves to {@link ListItemsResult} when `H` is `true`,
 * or {@link ListIdsResult} otherwise.
 *
 * Useful when writing generic utilities that work with both hydrated and non-hydrated results.
 *
 * @example
 * ```ts
 * function processResult<T, H extends boolean>(result: ListResult<T, H>) { ... }
 * ```
 */
export type ListResult<T = unknown, H extends boolean = false> =
  H extends true ? ListItemsResult<T> : ListIdsResult;

// ── Errors ─────────────────────────────────────────────────────────────────

/**
 * Thrown when the FlexDB server returns a non-2xx HTTP response.
 *
 * Inspect {@link FlexDBError.status} for the HTTP status code and
 * {@link FlexDBError.body} for the raw error payload from the server.
 *
 * @example
 * ```ts
 * import { FlexDBError } from "@arctics/flex-db-sdk";
 *
 * try {
 *   await db.get("missing-key");
 * } catch (err) {
 *   if (err instanceof FlexDBError) {
 *     if (err.status === 404) console.error("Item not found");
 *     if (err.status === 401) console.error("Invalid API key");
 *     if (err.status === 429) console.error("Rate limited — slow down");
 *     console.error("Server payload:", err.body);
 *   }
 * }
 * ```
 */
export class FlexDBError extends Error {
  /**
   * @param status  The HTTP status code returned by the server.
   * @param message Human-readable error message, extracted from the response body when available.
   * @param body    The raw response body (parsed JSON or plain text) for further inspection.
   */
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "FlexDBError";
  }
}

/**
 * Thrown when the HTTP request itself fails before a response is received —
 * for example due to a DNS failure, connection refused, or network timeout.
 *
 * The original error from `fetch` is available as {@link FlexDBNetworkError.cause}.
 *
 * @example
 * ```ts
 * import { FlexDBNetworkError } from "@arctics/flex-db-sdk";
 *
 * try {
 *   await db.get("some-key");
 * } catch (err) {
 *   if (err instanceof FlexDBNetworkError) {
 *     console.error("Network error:", err.message);
 *     console.error("Original cause:", err.cause);
 *   }
 * }
 * ```
 */
export class FlexDBNetworkError extends Error {
  /**
   * @param message Human-readable description including the attempt number.
   * @param cause   The underlying error thrown by `fetch`.
   */
  constructor(
    message: string,
    public override readonly cause: unknown,
  ) {
    super(message);
    this.name = "FlexDBNetworkError";
  }
}