/**
 * Zero-dependency HTTP transport layer for the FlexDB SDK.
 *
 * Handles URL construction, request serialisation, retry logic,
 * and error wrapping. Not intended for direct use — all public
 * functionality is exposed through {@link FlexDBClient}.
 *
 * @module
 */

// ─────────────────────────────────────────────
//  FlexDB SDK · HTTP Transport
//  Zero-dependency fetch wrapper with retry, error
//  handling, and edge-runtime compatibility.
// ─────────────────────────────────────────────

import { FlexDBError, FlexDBNetworkError, RetryConfig } from "./types.ts";

// ── Internal request shape ─────────────────────────────────────────────────

/**
 * Internal descriptor for a single HTTP request.
 * Consumed by {@link request} — not part of the public API.
 */
export interface RequestOptions {
  /** HTTP method for this request. */
  method: "GET" | "POST" | "PUT" | "DELETE";
  /** Path appended to the client's `baseUrl`, e.g. `"/v1/list"`. */
  path: string;
  /** Additional HTTP headers merged on top of the default `Authorization` and `Content-Type` headers. */
  headers?: Record<string, string>;
  /** Request body. Serialised to JSON automatically. */
  body?: unknown;
  /** Query-string parameters. `undefined` values are omitted. */
  query?: Record<string, string | number | boolean | undefined>;
  /** Optional `AbortSignal` for cancellation. */
  signal?: AbortSignal;
}

// ── Defaults ───────────────────────────────────────────────────────────────

/**
 * Default {@link RetryConfig} applied when no `retry` option is passed to
 * {@link createClient}.
 *
 * - `times: 3` — up to 3 retries after the first failure
 * - `delay: 10` — 10 ms between attempts
 */
export const DEFAULT_RETRY: RetryConfig = { times: 3, delay: 10 };

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Clamps retry `times` to the inclusive range `[0, 10]`.
 *
 * @param n - Raw retry count from user config.
 * @returns Clamped integer value.
 */
function clampRetryTimes(n: number): number {
  return Math.min(Math.max(Math.floor(n), 0), 10);
}

/**
 * Constructs the full request URL by joining `baseUrl` and `path`,
 * then appending a query string from `query` (if any non-`undefined` entries exist).
 *
 * @param baseUrl - Client base URL (trailing slash stripped).
 * @param path    - API path, e.g. `"/v1/list"`.
 * @param query   - Optional query parameters. `undefined` values are skipped.
 * @returns Fully-formed URL string.
 */
function buildUrl(baseUrl: string, path: string, query?: Record<string, string | number | boolean | undefined>): string {
  // Normalise base: strip trailing slash
  const base = baseUrl.replace(/\/$/, "");
  let url = `${base}${path}`;

  if (!query) return url;

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null) {
      params.set(k, String(v));
    }
  }

  const qs = params.toString();
  if (qs) url += `?${qs}`;
  return url;
}

/**
 * Promise-based sleep compatible with every JS runtime.
 *
 * @param ms - Duration in milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Returns `true` for HTTP status codes that represent transient server-side
 * conditions and are worth retrying.
 *
 * - `429` — rate limited
 * - `5xx` — server error
 *
 * @param status - HTTP response status code.
 */
function isRetryable(status: number): boolean {
  // 429 = rate limit, 5xx = server errors
  return status === 429 || status >= 500;
}

// ── Core transport ─────────────────────────────────────────────────────────

/**
 * Executes an HTTP request against the FlexDB API with optional retry logic.
 *
 * - Parses the response body as JSON when the server returns `Content-Type: application/json`.
 * - Returns `undefined` for empty responses (e.g. `204 No Content`).
 * - Throws {@link FlexDBError} for non-2xx HTTP responses.
 * - Throws {@link FlexDBNetworkError} when `fetch` itself fails (DNS, connection refused, etc.).
 * - Aborted requests (`AbortError`) are rethrown immediately without retrying.
 * - Client errors (`4xx`, excluding `429`) are thrown immediately without retrying.
 *
 * @param baseUrl    - Base URL of the FlexDB service.
 * @param authHeader - Pre-formatted `Authorization` header value, e.g. `"Bearer <token>"`.
 * @param opts       - Request descriptor. See {@link RequestOptions}.
 * @param retry      - Retry configuration, or `false` to disable retries entirely.
 * @returns Parsed JSON response body typed as `T`.
 *
 * @throws {@link FlexDBError} When the server returns a non-2xx status.
 * @throws {@link FlexDBNetworkError} When the underlying `fetch` call throws.
 */
export async function request<T = unknown>(
  baseUrl: string,
  authHeader: string,
  opts: RequestOptions,
  retry: RetryConfig | false,
): Promise<T> {
  const url = buildUrl(baseUrl, opts.path, opts.query);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: authHeader,
    ...opts.headers,
  };

    const fetchInit: RequestInit = {
    method: opts.method,
    headers,
    signal: opts.signal ?? null,
    };

  if (opts.body !== undefined) {
    fetchInit.body = JSON.stringify(opts.body);
  }

  // Resolve retry config — guard against out-of-range values
  const maxAttempts = retry === false ? 1 : 1 + clampRetryTimes(retry.times);
  const retryDelay  = retry === false ? 0 : Math.max(0, retry.delay);

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, fetchInit);

      if (response.ok) {
        // Prefer JSON; fall back to text for empty bodies (204 etc.)
        const ct = response.headers.get("Content-Type") ?? "";
        if (ct.includes("application/json")) {
          return (await response.json()) as T;
        }
        return undefined as unknown as T;
      }

      // Non-2xx — parse error body if possible
      let errorBody: unknown;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = await response.text().catch(() => undefined);
      }

      const message =
        typeof errorBody === "object" && errorBody !== null && "error" in errorBody
          ? String((errorBody as { error: unknown }).error)
          : `HTTP ${response.status}`;

      const err = new FlexDBError(response.status, message, errorBody);

      // Only retry on transient server errors
      if (attempt < maxAttempts && isRetryable(response.status)) {
        lastError = err;
        await sleep(retryDelay);
        continue;
      }

      throw err;

    } catch (err) {
      // Re-throw FlexDBErrors immediately (already handled above or not retryable)
      if (err instanceof FlexDBError) throw err;

      // AbortError — never retry
      if (err instanceof Error && err.name === "AbortError") throw err;

      // Network / unknown error — wrap and potentially retry
      lastError = new FlexDBNetworkError(
        `Request failed (attempt ${attempt}/${maxAttempts}): ${err instanceof Error ? err.message : String(err)}`,
        err,
      );

      if (attempt < maxAttempts) {
        await sleep(retryDelay);
        continue;
      }

      throw lastError;
    }
  }

  // Should never reach here, but satisfies TypeScript
  throw lastError;
}