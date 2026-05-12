/**
 * # Pagination
 *
 * Async-iterable cursor pagination for {@link FlexDBClient.list} and
 * {@link FlexDBClient.search}.
 *
 * Four factory functions handle the common patterns:
 *
 * | Function | Returns |
 * |---|---|
 * | {@link paginateList} | Keys from `list()` |
 * | {@link paginateListHydrated} | Full objects from `list()` |
 * | {@link paginateSearch} | Keys from `search()` |
 * | {@link paginateSearchHydrated} | Full objects from `search()` |
 *
 * Each returns a {@link Paginator} instance supporting `for await` iteration,
 * `.all()` to collect every item, and `.forEach()` for item-by-item processing.
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
 *   for (const { key, data } of page.data) console.log(key, data?.name);
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

// ─────────────────────────────────────────────
//  FlexDB SDK · Paginator
//  Async-iterable cursor pagination for list() and search().
//  Works identically in Node.js, Cloudflare Workers, and Vercel Edge.
// ─────────────────────────────────────────────

import type { FlexDBClient, NamespacedClient } from "./client.ts";
import type {
  ListOptions,
  SearchOptions,
  SearchParams,
  ListIdsResult,
  ListItemsResult,
} from "./types.ts";

// ─────────────────────────────────────────────────────────────────────────────
//  Internal page-fetcher types
// ─────────────────────────────────────────────────────────────────────────────

type PageFetcher<T> = (cursor?: string) => Promise<{ data: T[]; cursor?: string }>;

// ─────────────────────────────────────────────────────────────────────────────
//  Core Paginator class
// ─────────────────────────────────────────────────────────────────────────────

/**
 * An async-iterable paginator that steps through FlexDB result pages one at a time.
 *
 * Obtain an instance from one of the factory functions:
 * {@link paginateList}, {@link paginateListHydrated},
 * {@link paginateSearch}, or {@link paginateSearchHydrated}.
 *
 * ### Iteration
 *
 * ```ts
 * for await (const page of paginator) {
 *   console.log(page.data);    // items on this page
 *   console.log(page.cursor);  // opaque token for this position (undefined on last page)
 *   console.log(page.hasMore); // false on the last page
 * }
 * ```
 *
 * ### Collect all items
 *
 * ```ts
 * const all = await paginator.all();
 * ```
 *
 * > **Warning:** `.all()` loads every item into memory. Use with care on
 * > large namespaces.
 *
 * ### Process item-by-item
 *
 * ```ts
 * await paginator.forEach((item, index) => {
 *   console.log(index, item);
 * });
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

  /**
   * Async iterator implementation. Yields one {@link Page} per FlexDB response
   * until no `cursor` is returned.
   */
  async *[Symbol.asyncIterator](): AsyncGenerator<Page<T>> {
    let cursor: string | undefined = this.#startCursor;
    let isFirst = true;

    while (isFirst || cursor !== undefined) {
      isFirst = false;
      const result = await this.#fetch(cursor);
      cursor = result.cursor;

      yield {
        data:    result.data,
        cursor:  cursor,
        hasMore: cursor !== undefined,
      };
    }
  }

  /**
   * Collects every item across **all** pages into a single flat array.
   *
   * Makes as many API requests as needed to exhaust the cursor. Use with
   * caution on large datasets — all items are held in memory simultaneously.
   *
   * @returns A flat array of all items across all pages.
   *
   * @example
   * ```ts
   * const allUsers = await paginateList(db, { namespace: "users" }).all();
   * console.log(allUsers.length); // total number of users
   * ```
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
   *
   * Awaits `fn` before fetching the next page, so you can safely perform
   * async work inside the callback.
   *
   * @param fn - Callback invoked with each item and its zero-based index.
   *
   * @example
   * ```ts
   * await paginateList(db, { namespace: "users" }).forEach(async (key, i) => {
   *   const { data } = await db.get<User>(key);
   *   console.log(i, data.name);
   * });
   * ```
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
 *
 * @example
 * ```ts
 * for await (const page of paginator) {
 *   console.log(page.data);    // T[]
 *   console.log(page.cursor);  // string | undefined
 *   console.log(page.hasMore); // boolean
 * }
 * ```
 */
export interface Page<T> {
  /** Items on this page. */
  data: T[];
  /**
   * Opaque cursor pointing to the **next** page.
   * `undefined` when this is the last page.
   * Pass this as `cursor` to {@link FlexDBClient.list} or {@link FlexDBClient.search}
   * if you need to resume pagination manually.
   */
  cursor: string | undefined;
  /**
   * `true` if there are more pages after this one, `false` on the final page.
   * Equivalent to `page.cursor !== undefined`.
   */
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
 * Works with both {@link FlexDBClient} and {@link NamespacedClient}.
 *
 * @param client  - The client (or namespace-bound client) to paginate.
 * @param options - List options, excluding `cursor` and `hydrate` (managed internally).
 * @returns A {@link Paginator} of `string[]` pages.
 *
 * @example Iterate page-by-page
 * ```ts
 * import { paginateList } from "@arctics/flex-db-sdk";
 *
 * for await (const page of paginateList(db, { namespace: "users", limit: 50 })) {
 *   console.log(page.data);    // string[]
 *   console.log(page.hasMore); // false on the last page
 * }
 * ```
 *
 * @example Collect all keys at once
 * ```ts
 * const allKeys = await paginateList(db, { namespace: "users" }).all();
 * ```
 *
 * @example With a namespace-bound client (no need to specify namespace)
 * ```ts
 * const users = db.namespace("users");
 * const allKeys = await paginateList(users).all();
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
 * yielding arrays of **full objects**.
 *
 * The server activates hydration when `limit` ≤ 50. Each item is
 * `{ key: string; data: T | null }` — `data` may be `null` for objects
 * deleted between the index scan and the data fetch.
 *
 * @param client  - The client (or namespace-bound client) to paginate.
 * @param options - List options, excluding `cursor` and `hydrate`. Keep `limit` ≤ 50.
 * @returns A {@link Paginator} of `{ key: string; data: T | null }[]` pages.
 *
 * @example
 * ```ts
 * import { paginateListHydrated } from "@arctics/flex-db-sdk";
 *
 * interface User { name: string; age: number; }
 *
 * for await (const page of paginateListHydrated<User>(db, { namespace: "users", limit: 50 })) {
 *   for (const { key, data } of page.data) {
 *     console.log(key, data?.name); // data is null if the object was deleted mid-page
 *   }
 * }
 * ```
 */
export function paginateListHydrated<T = unknown>(
  client: AnyClient,
  options?: Omit<ListOptions, "cursor" | "hydrate">,
): Paginator<{ key: string; data: T | null }> {
  const fetcher: PageFetcher<{ key: string; data: T | null }> = async (cursor) => {
    const result = await (client as FlexDBClient).list<T>({
      ...options,
      cursor,
      hydrate: true,
    } as ListOptions & { hydrate: true });

    const r = result as ListItemsResult<T>;
    return { data: r.keys, cursor: r.cursor };
  };

  return new Paginator(fetcher);
}

/**
 * Creates a {@link Paginator} that steps through {@link FlexDBClient.search} pages,
 * yielding arrays of **object keys** (strings).
 *
 * Provide your metadata type as the generic `SP` for type-safe filters.
 *
 * @param client  - The client (or namespace-bound client) to paginate.
 * @param options - Search options, excluding `cursor` and `hydrate`. `filters` is required.
 * @returns A {@link Paginator} of `string[]` pages.
 *
 * @example
 * ```ts
 * import { paginateSearch } from "@arctics/flex-db-sdk";
 *
 * const pages = paginateSearch(db, {
 *   namespace: "products",
 *   filters:   { category: { eq: "books" } },
 *   limit:     50,
 * });
 *
 * for await (const page of pages) {
 *   console.log(page.data); // string[]
 * }
 * ```
 *
 * @example Collect all matching keys
 * ```ts
 * const bookKeys = await paginateSearch(db, {
 *   namespace: "products",
 *   filters:   { category: { eq: "books" } },
 * }).all();
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
 * yielding arrays of **full objects**.
 *
 * The server activates hydration when `limit` ≤ 50. Supply both data type `T` and
 * metadata type `SP` for full end-to-end typing.
 *
 * @param client  - The client (or namespace-bound client) to paginate.
 * @param options - Search options, excluding `cursor` and `hydrate`. `filters` is required. Keep `limit` ≤ 50.
 * @returns A {@link Paginator} of `{ key: string; data: T | null }[]` pages.
 *
 * @example
 * ```ts
 * import { paginateSearchHydrated } from "@arctics/flex-db-sdk";
 *
 * interface Product   { title: string; price: number; }
 * interface ProductSP { price: number; category: string; }
 *
 * for await (const page of paginateSearchHydrated<Product, ProductSP>(db, {
 *   namespace: "products",
 *   filters:   { price: { lte: 100 } },
 *   limit:     50,
 * })) {
 *   for (const { key, data } of page.data) {
 *     console.log(key, data?.title, data?.price);
 *   }
 * }
 * ```
 */
export function paginateSearchHydrated<T = unknown, SP extends SearchParams = SearchParams>(
  client: AnyClient,
  options: Omit<SearchOptions<SP>, "cursor" | "hydrate">,
): Paginator<{ key: string; data: T | null }> {
  const fetcher: PageFetcher<{ key: string; data: T | null }> = async (cursor) => {
    const result = await (client as FlexDBClient).search<T, SP>({
      ...options,
      cursor,
      hydrate: true,
    } as SearchOptions<SP> & { hydrate: true });

    const r = result as ListItemsResult<T>;
    return { data: r.keys, cursor: r.cursor };
  };

  return new Paginator(fetcher);
}
