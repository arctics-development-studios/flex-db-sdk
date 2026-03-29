// ─────────────────────────────────────────────
//  FlexDB SDK · Types
//  All public-facing TypeScript contracts live here.
// ─────────────────────────────────────────────

// ── Retry ──────────────────────────────────────────────────────────────────

/** How the SDK re-attempts failed requests. Set once at client creation. */
export interface RetryConfig {
  /**
   * Maximum number of retry attempts after the first failure.
   * 0 = no retries. Max = 10.
   * @default 3
   */
  times: number;

  /**
   * Fixed delay in milliseconds between each retry.
   * @default 10
   */
  delay: number;
}

// ── Client ─────────────────────────────────────────────────────────────────

/** Options passed to `createClient()`. */
export interface FlexDBClientOptions {
  /**
   * Your JWT API key.
   * Passed as `Authorization: Bearer <apiKey>`.
   */
  apiKey: string;

  /**
   * Base URL of the FlexDB service.
   * @example "https://eu.flex.arctics.dev"
   */
  baseUrl: string;

  /**
   * Default namespace (collection) for operations.
   * Can be overridden per-call via the `namespace` option.
   */
  namespace?: string;

  /**
   * Retry behaviour for every request.
   * Pass `false` to disable retries entirely.
   * @default { times: 3, delay: 10 }
   */
  retry?: RetryConfig | false;
}

// ── Namespace ──────────────────────────────────────────────────────────────

/** Options that every operation accepts to override client-level defaults. */
export interface OperationOptions {
  /**
   * Namespace override for this specific call.
   * Falls back to the client-level `namespace`.
   */
  namespace?: string;

  /**
   * Per-call AbortSignal for cancellation support.
   * Works across Cloudflare Workers, Vercel Edge, and Node.ts.
   */
  signal?: AbortSignal;
}

// ── Search Params ─────────────────────────────────────────────────────────

/**
 * Key-value map sent in `X-Search-Params` during create / update.
 * All values must be JSON-serialisable primitives or arrays.
 *
 * @example { category: "electronics", price: 99.99, tags: ["sale"] }
 */
export type SearchParams = Record<string, string | number | boolean | null | (string | number | boolean | null)[]>;

// ── Filter Operators ───────────────────────────────────────────────────────

/** Every filter operator supported by `/v1/search`. */
export interface FilterOperators<T = any> {
  /** Exact match */
  eq?: T;
  /** Not equal */
  neq?: T;
  /** Greater than */
  gt?: T;
  /** Greater than or equal */
  gte?: T;
  /** Less than */
  lt?: T;
  /** Less than or equal */
  lte?: T;
  /** String contains / array includes */
  inc?: T;
  /** String starts with */
  sw?: T;
  /** Attribute exists (true) or does not exist (false) */
  ex?: boolean;
}

/**
 * Typed filter map for `search()`.
 * Each key is a field you previously indexed via `X-Search-Params`.
 *
 * @example
 * { price: { gte: 10, lte: 100 }, category: { eq: "books" } }
 */
export type Filters<SP extends SearchParams = SearchParams> = {
  [K in keyof SP]?: FilterOperators<SP[K]>;
};

// ── CRUD Inputs ────────────────────────────────────────────────────────────

export interface SetOptions<SP extends SearchParams = SearchParams> extends OperationOptions {
  /** Fields to index for future `search()` calls. */
  searchParams?: SP;
}

export interface GetOptions extends OperationOptions {}

export interface DeleteOptions extends OperationOptions {}

// ── List / Search ─────────────────────────────────────────────────────────

export interface ListOptions extends OperationOptions {
  /** Number of results per page. Max 100. @default 20 */
  limit?: number;
  /** Opaque pagination token returned by the previous call. */
  cursor?: string;
  /**
   * When `true`, returns full objects instead of just IDs.
   * Only available when `limit` <= 20.
   */
  hydrate?: boolean;
}

export interface SearchOptions<SP extends SearchParams = SearchParams> extends ListOptions {
  /** Filter expressions to apply server-side. */
  filters: Filters<SP>;
}

// ── Responses ─────────────────────────────────────────────────────────────

export interface CreateResult {
  success: true;
  /** Server-generated NanoID key for the new item. */
  key: string;
}

export interface SetResult {
  success: true;
  /** The key used to store the item. */
  key: string;
}

export interface GetResult<T = unknown> {
  success: true;
  item: T;
}

export interface DeleteResult {
  success: true;
}

/** Returned when `hydrate` is `false` (default). */
export interface ListIdsResult {
  ids: string[];
  /** Pass this as `cursor` in the next call to fetch the following page. */
  nextCursor?: string;
}

/** Returned when `hydrate` is `true`. */
export interface ListItemsResult<T = unknown> {
  items: { id: string; data: T | null }[];
  nextCursor?: string;
}

export type ListResult<T = unknown, H extends boolean = false> =
  H extends true ? ListItemsResult<T> : ListIdsResult;

// ── Errors ─────────────────────────────────────────────────────────────────

/**
 * Thrown when the server returns a non-2xx status.
 * Inspect `.status` and `.body` for details.
 */
export class FlexDBError extends Error {
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
 * Thrown when the request itself fails (network error, timeout, DNS failure).
 * Wraps the original `cause`.
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