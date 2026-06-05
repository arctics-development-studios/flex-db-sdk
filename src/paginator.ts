/**
 * # Pagination
 *
 * Async-iterable cursor pagination for {@link FlexDBClient.list} and
 * {@link FlexDBClient.search}.
 *
 * | Function | Returns |
 * |---|---|
 * | {@link paginateList} | Keys from `list()` |
 * | {@link paginateListHydrated} | Full objects from `list()` |
 * | {@link paginateSearch} | Keys from `search()` |
 * | {@link paginateSearchHydrated} | Full objects from `search()` |
 *
 * ## Paginate by keys
 *
 * ```ts
 * import { paginateList } from "@arctics/flex-db-sdk";
 *
 * for await (const page of paginateList(db, { namespace: "users", limit: 50 })) {
 *   console.log(page.data);    // string[] of keys
 *   console.log(page.hasMore); // false on the last page
 * }
 * ```
 *
 * ## Paginate full objects
 *
 * ```ts
 * import { paginateListHydrated } from "@arctics/flex-db-sdk";
 *
 * for await (const page of paginateListHydrated<User>(db, { namespace: "users", limit: 50 })) {
 *   for (const { key, data } of page.data) console.log(key, data.name);
 * }
 * ```
 *
 * ## Collect everything at once
 *
 * ```ts
 * const allKeys = await paginateList(db, { namespace: "users" }).all();
 * ```
 *
 * @module
 */

import type { FlexDBClient, NamespacedClient } from "./client.ts";
import type {
  ListOptions,
  SearchOptions,
  SearchParams,
  ListIdsResult,
  ListItemsResult,
} from "./types.ts";

// ── Internal page-fetcher type ─────────────────────────────────────────────

type PageFetcher<T> = (cursor?: string) => Promise<{ data: T[]; cursor: string | null }>;

// ─────────────────────────────────────────────────────────────────────────────
//  Paginator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Async-iterable paginator that steps through FlexDB result pages one at a time.
 *
 * Obtain an instance from one of the factory functions:
 * {@link paginateList}, {@link paginateListHydrated},
 * {@link paginateSearch}, or {@link paginateSearchHydrated}.
 *
 * ### Iteration
 * ```ts
 * for await (const page of paginator) {
 *   console.log(page.data);    // items on this page
 *   console.log(page.hasMore); // false on the last page
 * }
 * ```
 *
 * ### Collect all items
 * ```ts
 * const all = await paginator.all();
 * ```
 */
export class Paginator<T> implements AsyncIterable<Page<T>> {
  readonly #fetch: PageFetcher<T>;
  readonly #startCursor: string | undefined;

  /** @internal Use the factory functions instead. */
  constructor(fetch: PageFetcher<T>, startCursor?: string) {
    this.#fetch       = fetch;
    this.#startCursor = startCursor;
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<Page<T>> {
    let cursor: string | null = this.#startCursor ?? null;
    let isFirst = true;

    while (isFirst || cursor !== null) {
      isFirst = false;
      const result = await this.#fetch(cursor ?? undefined);
      cursor = result.cursor;

      yield {
        data:    result.data,
        cursor:  cursor ?? undefined,
        hasMore: cursor !== null,
      };
    }
  }

  /**
   * Collects every item across all pages into a single flat array.
   * Use with caution on large namespaces — all items are held in memory.
   */
  async all(): Promise<T[]> {
    const collected: T[] = [];
    for await (const page of this) {
      collected.push(...page.data);
    }
    return collected;
  }

  /**
   * Calls `fn` once for each individual item across all pages, in order.
   */
  async forEach(fn: (item: T, index: number) => void | Promise<void>): Promise<void> {
    let i = 0;
    for await (const page of this) {
      for (const item of page.data) {
        await fn(item, i++);
      }
    }
  }
}

/**
 * A single page of results yielded by a {@link Paginator}.
 */
export interface Page<T> {
  data: T[];
  /** `undefined` when this is the last page. */
  cursor: string | undefined;
  /** `false` on the final page. */
  hasMore: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Factory helpers
// ─────────────────────────────────────────────────────────────────────────────

type AnyClient = FlexDBClient | NamespacedClient<any>;

/**
 * Creates a {@link Paginator} that steps through {@link FlexDBClient.list} pages,
 * yielding arrays of **object keys** (strings).
 *
 * @example
 * ```ts
 * for await (const page of paginateList(db, { namespace: "users", limit: 50 })) {
 *   console.log(page.data); // string[]
 * }
 * ```
 */
export function paginateList(
  client: AnyClient,
  options?: Omit<ListOptions, "cursor" | "hydrate">,
): Paginator<string> {
  const fetcher: PageFetcher<string> = async (cursor) => {
    const result = await (client as FlexDBClient).list({
      ...options,
      cursor,
      hydrate: false,
    } as ListOptions & { hydrate: false });

    const r = result as ListIdsResult;
    return { data: r.keys, cursor: r.cursor };
  };

  return new Paginator(fetcher);
}

/**
 * Creates a {@link Paginator} that steps through {@link FlexDBClient.list} pages,
 * yielding arrays of **full objects** (with `key` and `data`).
 *
 * @example
 * ```ts
 * for await (const page of paginateListHydrated<User>(db, { namespace: "users", limit: 50 })) {
 *   for (const { key, data } of page.data) console.log(key, data.name);
 * }
 * ```
 */
export function paginateListHydrated<T = unknown>(
  client: AnyClient,
  options?: Omit<ListOptions, "cursor" | "hydrate">,
): Paginator<{ key: string; data: T }> {
  const fetcher: PageFetcher<{ key: string; data: T }> = async (cursor) => {
    const result = await (client as FlexDBClient).list<T>({
      ...options,
      cursor,
      hydrate: true,
    } as ListOptions & { hydrate: true });

    const r = result as ListItemsResult<T>;
    return { data: r.items, cursor: r.cursor };
  };

  return new Paginator(fetcher);
}

/**
 * Creates a {@link Paginator} that steps through {@link FlexDBClient.search} pages,
 * yielding arrays of **object keys** (strings).
 *
 * @example
 * ```ts
 * for await (const page of paginateSearch(db, {
 *   namespace: "users",
 *   filters: { score: { gte: 1000 } },
 * })) {
 *   console.log(page.data); // string[]
 * }
 * ```
 */
export function paginateSearch<SP extends SearchParams = SearchParams>(
  client: AnyClient,
  options: Omit<SearchOptions<SP>, "cursor" | "hydrate">,
): Paginator<string> {
  const fetcher: PageFetcher<string> = async (cursor) => {
    const result = await (client as FlexDBClient).search<SP>({
      ...options,
      cursor,
      hydrate: false,
    } as SearchOptions<SP> & { hydrate: false });

    const r = result as ListIdsResult;
    return { data: r.keys, cursor: r.cursor };
  };

  return new Paginator(fetcher);
}

/**
 * Creates a {@link Paginator} that steps through {@link FlexDBClient.search} pages,
 * yielding arrays of **full objects** (with `key` and `data`).
 *
 * @example
 * ```ts
 * for await (const page of paginateSearchHydrated<User>(db, {
 *   namespace: "users",
 *   filters: { score: { gte: 1000 } },
 *   limit: 50,
 * })) {
 *   for (const { key, data } of page.data) console.log(key, data.name);
 * }
 * ```
 */
export function paginateSearchHydrated<T = unknown>(
  client: AnyClient,
  options: Omit<SearchOptions, "cursor" | "hydrate">,
): Paginator<{ key: string; data: T }> {
  const fetcher: PageFetcher<{ key: string; data: T }> = async (cursor) => {
    const result = await (client as FlexDBClient).search({
      ...options,
      cursor,
      hydrate: true,
    } as SearchOptions & { hydrate: true });

    const r = result as ListItemsResult<T>;
    return { data: r.items, cursor: r.cursor };
  };

  return new Paginator(fetcher);
}
