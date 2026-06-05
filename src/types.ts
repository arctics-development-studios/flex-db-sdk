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

// ── Retry ──────────────────────────────────────────────────────────────────

/**
 * Controls how the SDK re-attempts failed requests.
 *
 * | Scenario                | Retried? |
 * |-------------------------|----------|
 * | Network failure         | ✅        |
 * | HTTP 429 (rate limit)   | ✅        |
 * | HTTP 5xx (server error) | ✅        |
 * | HTTP 4xx (client error) | ❌        |
 * | `AbortSignal` fired     | ❌        |
 */
export interface RetryConfig {
  /**
   * Maximum number of retry attempts **after** the first failure.
   * `0` means no retries; the maximum accepted value is `10`.
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
 */
export interface FlexDBClientOptions {
  /**
   * Your RS256 JWT API key.
   * Sent as `Authorization: Bearer <apiKey>` on every request.
   */
  apiKey: string;
  /**
   * Base URL of your FlexDB service instance.
   * Trailing slashes are stripped automatically.
   */
  baseUrl: string;
  /**
   * Default namespace applied to every operation.
   * Can be overridden per-call or via {@link FlexDBClient.namespace}.
   */
  namespace?: string;
  /**
   * Retry behaviour for transient request failures.
   * Pass `false` to disable retries entirely.
   * @default \{ times: 3, delay: 10 \}
   */
  retry?: RetryConfig | false;
}

// ── Namespace ──────────────────────────────────────────────────────────────

/** Base options accepted by every CRUD and query operation. */
export interface OperationOptions {
  /** Namespace for this specific call. Overrides the client-level default. */
  namespace?: string;
  /** An `AbortSignal` to cancel this request immediately. */
  signal?: AbortSignal;
}

// ── Search Params ─────────────────────────────────────────────────────────

/**
 * A flat key-value map of fields to index at write-time via the `sp` option.
 * Values must be JSON scalars (string, number, boolean).
 */
export type SearchParams = Record<string, string | number | boolean>;

// ── Filter Operators ───────────────────────────────────────────────────────

/**
 * Comparison operators used inside {@link Filters}.
 *
 * ```ts
 * // Price between 10 and 100, category is "electronics", name starts with "Wi"
 * filters: {
 *   price:    { gte: 10, lte: 100 },
 *   category: { eq: "electronics" },
 *   name:     { starts_with: "Wi" },
 * }
 * ```
 */
export interface FilterOperators<T = any> {
  /** Exact match — `field === value`. */
  eq?: T;
  /** Not equal — `field !== value`. */
  ne?: T;
  /** Greater than — `field > value`. */
  gt?: T;
  /** Greater than or equal — `field >= value`. */
  gte?: T;
  /** Less than — `field < value`. */
  lt?: T;
  /** Less than or equal — `field <= value`. */
  lte?: T;
  /** String contains the given substring. */
  contains?: T;
  /** String starts with the given prefix. */
  starts_with?: T;
}

/**
 * Typed filter map for {@link FlexDBClient.search}.
 *
 * Each key corresponds to an `sp` field indexed at write-time.
 * All filters in a single request are AND-ed together.
 */
export type Filters<SP extends SearchParams = SearchParams> = {
  [K in keyof SP]?: FilterOperators<SP[K]>;
};

// ── CRUD Inputs ────────────────────────────────────────────────────────────

/**
 * Options for {@link FlexDBClient.create}.
 */
export interface CreateOptions<SP extends SearchParams = SearchParams> extends OperationOptions {
  /** Search parameters to store alongside the object. */
  sp?: SP;
}

/**
 * Options for {@link FlexDBClient.set}.
 */
export interface SetOptions<SP extends SearchParams = SearchParams> extends OperationOptions {
  /**
   * Search parameters to store alongside the object.
   * Must be a flat object of `string → scalar` pairs.
   * Used for filtered queries via {@link FlexDBClient.search}.
   */
  sp?: SP;
}

/** Options for {@link FlexDBClient.get}. Inherits {@link OperationOptions}. */
export interface GetOptions extends OperationOptions {}

/** Options for {@link FlexDBClient.delete}. Inherits {@link OperationOptions}. */
export interface DeleteOptions extends OperationOptions {}

// ── List / Search ─────────────────────────────────────────────────────────

/** Options for {@link FlexDBClient.list}. */
export interface ListOptions extends OperationOptions {
  /**
   * Maximum number of results per page.
   * Accepted range: 1–1000. Values outside this range are clamped.
   * @default 100
   */
  limit?: number;
  /**
   * Opaque pagination cursor from a previous response.
   * Omit to start from the beginning.
   */
  cursor?: string;
  /** When `true`, returns full objects instead of just keys. */
  hydrate?: boolean;
}

/** Options for {@link FlexDBClient.search}. Extends {@link ListOptions} with required `filters`. */
export interface SearchOptions<SP extends SearchParams = SearchParams> extends ListOptions {
  /**
   * Filter conditions. All filters are AND-ed together. Must be non-empty.
   * See {@link Filters} and {@link FilterOperators}.
   */
  filters: Filters<SP>;
}

// ── Responses ─────────────────────────────────────────────────────────────

/** Returned by {@link FlexDBClient.health}. */
export interface HealthResult {
  v: string;
  ok: true;
  status: string;
  version: string;
}

/** Returned by {@link FlexDBClient.create}. */
export interface CreateResult {
  /** Server-generated nanoid(21) key. */
  key: string;
}

/** Returned by {@link FlexDBClient.set}. */
export interface SetResult {
  key: string;
}

/** Returned by {@link FlexDBClient.get}. */
export interface GetResult<T = unknown> {
  data: T;
}

/** Returned by {@link FlexDBClient.delete}. */
export interface DeleteResult {}

/** Returned by list/search when `hydrate` is `false` (default). */
export interface ListIdsResult {
  keys: string[];
  cursor: string | null;
}

/** Returned by list/search when `hydrate: true`. */
export interface ListItemsResult<T = unknown> {
  items: { key: string; data: T }[];
  cursor: string | null;
}

/**
 * Conditional helper that resolves to {@link ListItemsResult} when `H` is `true`,
 * or {@link ListIdsResult} otherwise.
 */
export type ListResult<T = unknown, H extends boolean = false> =
  H extends true ? ListItemsResult<T> : ListIdsResult;

// ── Bulk Operations ───────────────────────────────────────────────────────

/** A single item in a {@link FlexDBClient.bulkGet} response. */
export interface BulkGetItem<T = unknown> {
  key: string;
  /** `true` when the object was found; `false` when the key does not exist. */
  ok: boolean;
  /** Present only when `ok` is `true`. */
  data?: T;
}

/** Returned by {@link FlexDBClient.bulkGet}. */
export interface BulkGetResult<T = unknown> {
  items: BulkGetItem<T>[];
}

/** A single item in a {@link FlexDBClient.bulkCreate} request. */
export interface BulkCreateItem<T = unknown, SP extends SearchParams = SearchParams> {
  data: T;
  /** Search parameters to index for future queries. */
  sp?: SP;
}

/** Per-item result in a {@link BulkCreateResult}. */
export interface BulkCreateResultItem {
  ok: boolean;
  /** Server-generated key. Present only when `ok` is `true`. */
  id?: string;
  /** Error message. Present only when `ok` is `false`. */
  error?: string;
}

/** Returned by {@link FlexDBClient.bulkCreate}. */
export interface BulkCreateResult {
  items: BulkCreateResultItem[];
}

/** A single item in a {@link FlexDBClient.bulkSet} request. */
export interface BulkSetItem<T = unknown, SP extends SearchParams = SearchParams> {
  key: string;
  data: T;
  /** Search parameters to index for future queries. */
  sp?: SP;
}

/** Per-item result in a {@link BulkSetResult}. */
export interface BulkSetResultItem {
  ok: boolean;
  /** Present only when `ok` is `false`. */
  error?: string;
}

/** Returned by {@link FlexDBClient.bulkSet}. */
export interface BulkSetResult {
  items: BulkSetResultItem[];
}

/** Returned by {@link FlexDBClient.bulkDelete}. */
export interface BulkDeleteResult {}

// ── Errors ─────────────────────────────────────────────────────────────────

/**
 * Thrown when the FlexDB server returns a non-2xx HTTP response.
 *
 * Branch on `code` rather than `message` in catch blocks — `code` is a stable
 * string constant while `message` is human-readable and may change.
 *
 * Known codes: `ERR_MISSING_AUTH`, `ERR_UNAUTHORIZED`, `ERR_PERMISSION_DENIED`,
 * `ERR_FORBIDDEN`, `ERR_NOT_FOUND`, `ERR_CONFLICT`, `ERR_REQUEST_TOO_LARGE`,
 * `ERR_BULK_TOO_LARGE`, `ERR_UNPROCESSABLE_ENTITY`, `ERR_RATE_LIMIT_SECOND`,
 * `ERR_RATE_LIMIT_MONTH`, `ERR_MISSING_FILTER`, `ERR_INVALID_REQUEST`,
 * `ERR_STORE_FAILED`, `ERR_DELETE_FAILED`, `ERR_INTERNAL`.
 *
 * @example
 * ```ts
 * try {
 *   await db.get("missing-key");
 * } catch (err) {
 *   if (err instanceof FlexDBError) {
 *     switch (err.code) {
 *       case "ERR_NOT_FOUND":        console.error("Object not found"); break;
 *       case "ERR_UNAUTHORIZED":     console.error("Invalid or expired token"); break;
 *       case "ERR_RATE_LIMIT_SECOND":console.error("Per-second rate limit hit"); break;
 *       case "ERR_RATE_LIMIT_MONTH": console.error("Monthly limit exhausted"); break;
 *     }
 *   }
 * }
 * ```
 */
export class FlexDBError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
    public readonly code?: string,
    public readonly hint?: string,
  ) {
    let formatted = code ? `[${code}] ` : "";
    formatted += `(${status}): ${message}`;
    if (hint) formatted += `\nHint: ${hint}`;
    super(formatted);
    this.name = "FlexDBError";
  }
}

/**
 * Thrown when the HTTP request itself fails before a response is received
 * (DNS failure, connection refused, network timeout, etc.).
 */
export class FlexDBNetworkError extends Error {
  constructor(
    message: string,
    public override readonly cause: unknown,
  ) {
    super(message);
    this.name = "FlexDBNetworkError";
  }
}
