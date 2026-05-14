/**
 * # Types and Interfaces
 *
 * All public-facing TypeScript contracts for the FlexDB SDK.
 *
 * This module is re-exported from the root
 * {@link https://jsr.io/@arctics/flex-db-sdk | @arctics/flex-db-sdk} package —
 * you rarely need to import from here directly. Use the main package import instead:
 *
 * ```ts
 * import type { FlexDBClientOptions, Filters } from "@arctics/flex-db-sdk";
 * ```
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
   * const { data } = await db.get("some-key", { signal: controller.signal });
   * ```
   */
  signal?: AbortSignal;
}

// ── Search Params ─────────────────────────────────────────────────────────

/**
 * A flat key-value map of fields to index at write-time.
 *
 * Pass this as `metadata` when calling {@link FlexDBClient.create} or
 * {@link FlexDBClient.set}. The values are stored alongside the object and
 * can later be queried with {@link FlexDBClient.search} using
 * {@link FilterOperators}.
 *
 * All values must be JSON-serialisable primitives or arrays thereof.
 * Nested objects are not supported as metadata field values.
 *
 * @example
 * ```ts
 * // Index these fields at write-time…
 * await db.create(
 *   { title: "Widget Pro", price: 49.99 },
 *   { metadata: { price: 49.99, category: "electronics", inStock: true } },
 * );
 *
 * // …then filter on them later
 * const { keys } = await db.search({
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
  /** String starts with the given prefix. */
  sw?: T;
  /**
   * Attribute existence check.
   * `true` → field must exist in the stored metadata.
   * Note: passing `false` has no server-side effect — the API only implements
   * the existence check, not the absence check.
   */
  ex?: boolean;
}

/**
 * Typed filter map for {@link FlexDBClient.search}.
 *
 * Each key corresponds to a metadata field you previously indexed via the
 * `metadata` option on {@link FlexDBClient.create} or {@link FlexDBClient.set}.
 * The value is a {@link FilterOperators} object describing the predicate.
 *
 * All filters in a single request are AND-ed together — there is no OR support.
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
 * Extends {@link OperationOptions} with an optional `metadata` field
 * for indexing fields at write-time.
 *
 * @example
 * ```ts
 * await db.set("user-42", { name: "Bob", age: 25 }, {
 *   namespace: "users",
 *   metadata:  { age: 25, role: "viewer" },
 * });
 * ```
 */
export interface SetOptions<SP extends SearchParams = SearchParams> extends OperationOptions {
  /**
   * Key-value pairs to store alongside the object and index for future
   * {@link FlexDBClient.search} calls.
   *
   * Values should be scalar (string, number, boolean) for filter operators
   * to work correctly. Nested objects are not supported.
   *
   * To clear all metadata on an update, pass an empty object: `metadata: {}`.
   */
  metadata?: SP;
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
 *   console.log(result.keys);
 *   cursor = result.cursor;
 * } while (cursor);
 * ```
 *
 * @example Return full objects instead of keys (limit must be ≤ 50)
 * ```ts
 * const { keys } = await db.list<User>({ namespace: "users", hydrate: true, limit: 50 });
 * for (const { key, data } of keys) {
 *   console.log(key, data?.name);
 * }
 * ```
 */
export interface ListOptions extends OperationOptions {
  /**
   * Maximum number of results to return per page.
   * Accepted range: 1–100. Values above 100 are silently clamped to 100.
   * Non-integer values default to 20.
   * @default 20
   */
  limit?: number;
  /**
   * Opaque pagination cursor returned as `cursor` from the previous call.
   * Omit (or pass `undefined`) to start from the beginning.
   * Treat cursors as opaque — do not parse, construct, or modify them.
   */
  cursor?: string;
  /**
   * When `true`, each result includes the full stored object instead of just its key.
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
 * const { keys } = await db.search({
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
   * Filter expressions evaluated server-side against the stored `metadata`.
   * All filters are AND-ed together — there is no OR support.
   * See {@link Filters} and {@link FilterOperators} for the full operator reference.
   */
  filters: Filters<SP>;
}

// ── Responses ─────────────────────────────────────────────────────────────

/**
 * Returned by {@link FlexDBClient.health}.
 *
 * @example
 * ```ts
 * const { status } = await db.health();
 * console.log(status); // "healthy"
 * ```
 */
export interface HealthResult {
  v: 1;
  ok: true;
  /** `"healthy"` when the service is operating normally. */
  status: string;
  /** Server version string (semver). */
  version: string;
}

/**
 * Metadata stored alongside every FlexDB object and returned on reads.
 *
 * | Field | Description |
 * |-------|-------------|
 * | `w`   | `true` = warm tier (DynamoDB); `false` = cold tier (S3). |
 * | `s`   | Serialised byte size of `data` as stored (UTF-8 JSON). |
 * | `lut` | Unix timestamp (seconds) of the last write. |
 * | `upi` | Reserved; always `0`. |
 * | `sp`  | Search parameters indexed at write-time. |
 */
export interface ObjectMeta<SP extends SearchParams = SearchParams> {
  /** Storage tier — `true` = warm (DynamoDB), `false` = cold (S3). */
  w: boolean;
  /** Serialised byte size of `data` at last write. Useful for cost analysis. */
  s: number;
  /** Last-updated Unix timestamp in seconds. */
  lut: number;
  /** Reserved field — always `0`. */
  upi: number;
  /** Search parameters stored with this object (set via `metadata` on writes). */
  sp: SP;
}

/**
 * Returned by {@link FlexDBClient.create}.
 *
 * @example
 * ```ts
 * const result: CreateResult = await db.create({ name: "Alice" });
 * console.log(result.key); // "V1StGXR8_Z5jdHi6B-myT" (NanoID, 21 chars)
 * ```
 */
export interface CreateResult {
  v: 1;
  ok: true;
  /**
   * Server-generated NanoID key (21 URL-safe characters) for the newly created object.
   * Store this key — it is the only way to retrieve, update, or delete the object later.
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
  v: 1;
  ok: true;
  /** Echoes the caller-supplied key used to store the object. */
  key: string;
}

/**
 * Returned by {@link FlexDBClient.get}.
 *
 * @example
 * ```ts
 * const { key, data, metadata } = await db.get<User>("abc123");
 * console.log(data.name);       // "Alice"
 * console.log(metadata.w);      // true = warm tier (DynamoDB)
 * console.log(metadata.lut);    // Unix timestamp of last write
 * console.log(metadata.sp);     // search params stored at write-time
 * ```
 */
export interface GetResult<T = unknown, SP extends SearchParams = SearchParams> {
  v: 1;
  ok: true;
  /** Echoes the key used to fetch this object. */
  key: string;
  /** The stored object, deserialised as type `T`. */
  data: T;
  /** Full metadata record for this object. */
  metadata: ObjectMeta<SP>;
}

/**
 * Returned by {@link FlexDBClient.delete}.
 *
 * @example
 * ```ts
 * const { ok } = await db.delete("abc123");
 * console.log(ok); // true
 * ```
 */
export interface DeleteResult {
  v: 1;
  ok: true;
}

/**
 * Returned by {@link FlexDBClient.list} and {@link FlexDBClient.search}
 * when `hydrate` is `false` (the default).
 *
 * @example
 * ```ts
 * const { keys, cursor } = await db.list({ namespace: "users", limit: 50 });
 * console.log(keys);   // ["abc", "def", ...]
 * console.log(cursor); // "eyJrZXkiOi..." or undefined (last page)
 * ```
 */
export interface ListIdsResult {
  v: 1;
  ok: true;
  /** Array of object keys on this page. Empty array `[]` if no objects exist. */
  keys: string[];
  /**
   * Pass this token as `cursor` in the next call to fetch the following page.
   * `undefined` indicates there are no more pages.
   */
  cursor?: string;
}

/**
 * Returned by {@link FlexDBClient.list} and {@link FlexDBClient.search}
 * when `hydrate: true` is set.
 *
 * @example
 * ```ts
 * const { keys } = await db.list<User>({ hydrate: true, limit: 50 });
 * for (const { key, data } of keys) {
 *   console.log(key, data?.name); // data is null if the object was deleted mid-page
 * }
 * ```
 */
export interface ListItemsResult<T = unknown> {
  v: 1;
  ok: true;
  /**
   * Array of `{ key, data }` pairs on this page.
   * `data` may be `null` if an object existed in the index but could not be
   * retrieved from storage (e.g. deleted between index and fetch).
   */
  keys: { key: string; data: T | null }[];
  /**
   * Pass this token as `cursor` in the next call to fetch the following page.
   * `undefined` indicates there are no more pages.
   */
  cursor?: string;
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

// ── Partial Update ─────────────────────────────────────────────────────────

/**
 * Returned by {@link FlexDBClient.updateOne}.
 *
 * @example
 * ```ts
 * const { key } = await db.updateOne("abc123", { data: { age: 31 } });
 * console.log(key); // "abc123"
 * ```
 */
export interface UpdateOneResult {
  v: 1;
  ok: true;
  /** Echoes the key of the patched object. */
  key: string;
}

/**
 * Options for {@link FlexDBClient.update} — partial update by filter.
 *
 * @example
 * ```ts
 * const { updated, cursor } = await db.update({
 *   namespace: "products",
 *   filters:   { status: { eq: "active" } },
 *   data:      { status: "archived" },
 *   metadata:  { status: "archived" },
 *   limit:     50,
 * });
 * ```
 */
export interface UpdateOptions<SP extends SearchParams = SearchParams> extends OperationOptions {
  /** Filter conditions — all AND-ed. Same syntax as {@link SearchOptions.filters}. Must be non-empty. */
  filters: Filters<SP>;
  /** Fields to shallow-merge into each matching object's `data`. Omit to leave data unchanged. */
  data?: unknown;
  /** Fields to shallow-merge into each matching object's `metadata.sp`. Omit to leave metadata unchanged. */
  metadata?: SP;
  /**
   * Maximum objects to process per call. Range: 1–100. Values above 100 are clamped to 100.
   * @default 20
   */
  limit?: number;
  /** Pagination token from the previous response. Omit on first call. */
  cursor?: string;
}

/**
 * Returned by {@link FlexDBClient.update}.
 *
 * @example
 * ```ts
 * let cursor: string | undefined;
 * do {
 *   const result = await db.update({ namespace: "users", filters: { role: { eq: "guest" } }, data: { active: false } });
 *   console.log(`Patched ${result.updated} objects`);
 *   cursor = result.cursor;
 * } while (cursor);
 * ```
 */
export interface UpdateResult {
  v: 1;
  ok: true;
  /** Number of objects successfully patched in this call. */
  updated: number;
  /**
   * Present when more matching objects exist beyond this page.
   * Pass to the next call's `cursor` option to continue.
   */
  cursor?: string;
}

// ── Bulk Operations ───────────────────────────────────────────────────────

/**
 * A single item in a {@link FlexDBClient.bulkCreate} request.
 *
 * @example
 * ```ts
 * const items: BulkCreateItem<User, UserSP>[] = [
 *   { data: { name: "Alice" }, metadata: { age: 30, role: "admin" } },
 *   { data: { name: "Bob" } },
 * ];
 * const { keys } = await db.bulkCreate(items, { namespace: "users" });
 * ```
 */
export interface BulkCreateItem<T = unknown, SP extends SearchParams = SearchParams> {
  /** The value to store. Can be any JSON-serialisable value. */
  data: T;
  /** Key-value pairs to index for future {@link FlexDBClient.search} queries. */
  metadata?: SP;
}

/**
 * Returned by {@link FlexDBClient.bulkCreate}.
 *
 * @example
 * ```ts
 * const { keys } = await db.bulkCreate([{ data: { name: "Alice" } }], { namespace: "users" });
 * console.log(keys); // ["V1StGXR8_Z5jdHi6B-myT", ...]
 * ```
 */
export interface BulkCreateResult {
  v: 1;
  ok: true;
  /** Auto-generated keys for each created object, in the same order as the input `items`. */
  keys: string[];
}

/**
 * A single item in a {@link FlexDBClient.bulkSet} request.
 *
 * @example
 * ```ts
 * const items: BulkSetItem<User, UserSP>[] = [
 *   { key: "user-1", data: { name: "Alice" }, metadata: { age: 30 } },
 *   { key: "user-2", data: { name: "Bob" } },
 * ];
 * const { keys } = await db.bulkSet(items, { namespace: "users" });
 * ```
 */
export interface BulkSetItem<T = unknown, SP extends SearchParams = SearchParams> {
  /** The key to create or fully overwrite. */
  key: string;
  /** Fully replaces the previously stored value. */
  data: T;
  /** Fully replaces the previously stored metadata. Pass `{}` to clear. */
  metadata?: SP;
}

/**
 * Returned by {@link FlexDBClient.bulkSet}.
 *
 * @example
 * ```ts
 * const { keys } = await db.bulkSet([{ key: "user-1", data: { name: "Alice" } }], { namespace: "users" });
 * console.log(keys); // ["user-1"]
 * ```
 */
export interface BulkSetResult {
  v: 1;
  ok: true;
  /** The input keys echoed back in the same order as the input `items`. */
  keys: string[];
}

/**
 * Returned by {@link FlexDBClient.bulkDelete}.
 *
 * @example
 * ```ts
 * await db.bulkDelete(["user-1", "user-2"], { namespace: "users" });
 * ```
 */
export interface BulkDeleteResult {
  v: 1;
  ok: true;
}

// ── Errors ─────────────────────────────────────────────────────────────────

/**
 * Thrown when the FlexDB server returns a non-2xx HTTP response.
 *
 * Inspect {@link FlexDBError.status} for the HTTP status code,
 * {@link FlexDBError.code} for the stable machine-readable error constant,
 * and {@link FlexDBError.body} for the full raw error payload.
 *
 * Branch on `code` rather than `message` — `code` is a stable string constant
 * while `message` is human-readable and may change between API versions.
 *
 * @example
 * ```ts
 * import { FlexDBError } from "@arctics/flex-db-sdk";
 *
 * try {
 *   await db.get("missing-key");
 * } catch (err) {
 *   if (err instanceof FlexDBError) {
 *     switch (err.code) {
 *       case "ERR_NOT_FOUND":        console.error("Object not found"); break;
 *       case "ERR_UNAUTHORIZED":     console.error("Invalid or expired token"); break;
 *       case "ERR_PERMISSION_DENIED":console.error("Token lacks required permission"); break;
 *       case "ERR_RATE_LIMIT_SECOND":console.error("Per-second rate limit hit"); break;
 *       case "ERR_RATE_LIMIT_MONTH": console.error("Monthly limit exhausted"); break;
 *       default: console.error(`Server error ${err.status}:`, err.message);
 *     }
 *     if (err.hint) console.info("Hint:", err.hint);
 *   }
 * }
 * ```
 */
export class FlexDBError extends Error {
  /**
   * @param status  The HTTP status code returned by the server.
   * @param message Human-readable error message, extracted from the response body when available.
   * @param body    The raw response body (parsed JSON or plain text) for further inspection.
   * @param code    Stable machine-readable error code string, e.g. `"ERR_NOT_FOUND"`.
   * @param hint    Actionable suggestion from the server for resolving the error.
   */
  constructor(
    /** HTTP status code returned by the server (e.g. `404`, `401`, `429`). */
    public readonly status: number,
    message: string,
    /** The raw response body (parsed JSON or plain text). */
    public readonly body?: unknown,
    /**
     * Stable machine-readable error code string.
     * Branch on this in catch blocks — it is guaranteed not to change between API versions.
     *
     * Known codes: `ERR_MISSING_AUTH`, `ERR_MISSING_NAMESPACE`, `ERR_UNAUTHORIZED`,
     * `ERR_PERMISSION_DENIED`, `ERR_FORBIDDEN`, `ERR_NOT_FOUND`, `ERR_MISSING_FILTER`,
     * `ERR_RATE_LIMIT_SECOND`, `ERR_RATE_LIMIT_MONTH`, `ERR_REQUEST_TOO_LARGE`,
     * `ERR_STORE_FAILED`, `ERR_DELETE_FAILED`, `ERR_INTERNAL`.
     */
    public readonly code?: string,
    /**
     * Actionable suggestion from the server describing how to resolve the error.
     * Present when the server provides guidance; `undefined` otherwise.
     */
    public readonly hint?: string,
  ) {
    // Build a rich message so logs and stack traces are immediately actionable
    // without requiring the developer to inspect individual properties.
    //
    // Output format:
    //   [ERR_NOT_FOUND] (404): No object exists with this key.
    //   Hint: Verify the key and namespace are correct.
    let formatted = code ? `[${code}] ` : "";
    formatted += `(${status}): ${message}`;
    if (hint) formatted += `\nHint: ${hint}`;
    super(formatted);
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
