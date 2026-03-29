// ─────────────────────────────────────────────
//  FlexDB SDK · HTTP Transport
//  Zero-dependency fetch wrapper with retry, error
//  handling, and edge-runtime compatibility.
// ─────────────────────────────────────────────

import { FlexDBError, FlexDBNetworkError, RetryConfig } from "./types.ts";

// ── Internal request shape ─────────────────────────────────────────────────

export interface RequestOptions {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  headers?: Record<string, string>;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
}

// ── Defaults ───────────────────────────────────────────────────────────────

export const DEFAULT_RETRY: RetryConfig = { times: 3, delay: 10 };

// ── Helpers ────────────────────────────────────────────────────────────────

/** Clamps retry `times` to [0, 10]. */
function clampRetryTimes(n: number): number {
  return Math.min(Math.max(Math.floor(n), 0), 10);
}

/** Builds the final URL, appending a query string when needed. */
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

/** Tiny sleep using a Promises — works in every JS environment. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Returns true for status codes that are worth retrying. */
function isRetryable(status: number): boolean {
  // 429 = rate limit, 5xx = server errors
  return status === 429 || status >= 500;
}

// ── Core transport ─────────────────────────────────────────────────────────

/**
 * Executes a request with optional retry logic.
 * Returns the parsed JSON response body on success.
 * Throws `FlexDBError` for non-2xx HTTP responses.
 * Throws `FlexDBNetworkError` for connection/network failures.
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