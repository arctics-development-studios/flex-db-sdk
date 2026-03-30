/**
 * Async-iterable cursor pagination for {@link FlexDBClient.list} and
 * {@link FlexDBClient.search}.
 *
 * The recommended helpers are the four factory functions:
 *
 * | Function | Returns |
 * |---|---|
 * | {@link paginateList} | IDs from `list()` |
 * | {@link paginateListHydrated} | Full objects from `list()` |
 * | {@link paginateSearch} | IDs from `search()` |
 * | {@link paginateSearchHydrated} | Full objects from `search()` |
 *
 * All four return a {@link Paginator} instance you can iterate with `for await`,
 * call `.all()` on to collect every item, or `.forEach()` to process item-by-item.
 *
 * @example Iterate pages of IDs
 * ```ts
 * import { paginateList } from "@arctics/flex-db-sdk";
 *
 * for await (const page of paginateList(db, { namespace: "users", limit: 50 })) {
 *   console.log(page.data);    // string[]
 *   console.log(page.hasMore); // false on the last page
 * }
 * ```
 *
 * @example Collect all IDs at once
 * ```ts
 * const allIds = await paginateList(db, { namespace: "users" }).all();
 * ```
 *
 * @example Iterate full objects
 * ```ts
 * import { paginateListHydrated } from "@arctics/flex-db-sdk";
 *
 * for await (const page of paginateListHydrated<User>(db, { namespace: "users", limit: 20 })) {
 *   for (const { id, data } of page.data) console.log(id, data?.name);
 * }
 * ```
 *
 * @module
 */

// ─────────────────────────────────────────────
//  FlexDB SDK · Paginator
//  Async-iterable cursor pagination for list() and search().
//  Works identically in Node.ts, Cloudflare Workers, and Vercel Edge.
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

type PageFetcher<T> = (cursor?: string) => Promise<{ data: T[]; nextCursor?: string }>;

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
   * until no `nextCursor` is returned.
   */
  async *[Symbol.asyncIterator](): AsyncGenerator<Page<T>> {
    let cursor: string | undefined = this.#startCursor;
    let isFirst = true;

    while (isFirst || cursor !== undefined) {
      isFirst = false;
      const result = await this.#fetch(cursor);
      cursor = result.nextCursor;

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
   * await paginateList(db, { namespace: "users" }).forEach(async (id, i) => {
   *   const { item } = await db.get<User>(id);
   *   console.log(i, item.name);
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
 * yielding arrays of **item IDs** (strings).
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
 * @example Collect all IDs at once
 * ```ts
 * const allIds = await paginateList(db, { namespace: "users" }).all();
 * ```
 *
 * @example With a namespace-bound client (no need to specify namespace)
 * ```ts
 * const users = db.namespace("users");
 * const allIds = await paginateList(users).all();
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
    return { data: r.ids, ...(r.nextCursor ? { nextCursor: r.nextCursor } : {}) };
  };

  return new Paginator(fetcher);
}

/**
 * Creates a {@link Paginator} that steps through {@link FlexDBClient.list} pages,
 * yielding arrays of **full item objects**.
 *
 * Requires `limit` ≤ 20 (server constraint). Each item is `{ id: string; data: T | null }`.
 *
 * @param client  - The client (or namespace-bound client) to paginate.
 * @param options - List options, excluding `cursor` and `hydrate`. Set `limit` to ≤ 20.
 * @returns A {@link Paginator} of `{ id: string; data: T | null }[]` pages.
 *
 * @example
 * ```ts
 * import { paginateListHydrated } from "@arctics/flex-db-sdk";
 *
 * interface User { name: string; age: number; }
 *
 * for await (const page of paginateListHydrated<User>(db, { namespace: "users", limit: 20 })) {
 *   for (const { id, data } of page.data) {
 *     console.log(id, data?.name); // data is null if the item was deleted mid-page
 *   }
 * }
 * ```
 */
export function paginateListHydrated<T = unknown>(
  client: AnyClient,
  options?: Omit<ListOptions, "cursor" | "hydrate">,
): Paginator<{ id: string; data: T | null }> {
  const fetcher: PageFetcher<{ id: string; data: T | null }> = async (cursor) => {
    const result = await (client as FlexDBClient).list<T>({
      ...options,
      cursor,
      hydrate: true,
    } as ListOptions & { hydrate: true });

    const r = result as ListItemsResult<T>;
    return { data: r.items, ...(r.nextCursor ? { nextCursor: r.nextCursor } : {}) };
  };

  return new Paginator(fetcher);
}

/**
 * Creates a {@link Paginator} that steps through {@link FlexDBClient.search} pages,
 * yielding arrays of **item IDs** (strings).
 *
 * Provide your `SearchParams` interface as the generic `SP` for type-safe filters.
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
 * @example Collect all matching IDs
 * ```ts
 * const bookIds = await paginateSearch(db, {
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
    return { data: r.ids, ...(r.nextCursor ? { nextCursor: r.nextCursor } : {}) };
  };

  return new Paginator(fetcher);
}

/**
 * Creates a {@link Paginator} that steps through {@link FlexDBClient.search} pages,
 * yielding arrays of **full item objects**.
 *
 * Requires `limit` ≤ 20 (server constraint). Supply both data type `T` and
 * search-params type `SP` for full end-to-end typing.
 *
 * @param client  - The client (or namespace-bound client) to paginate.
 * @param options - Search options, excluding `cursor` and `hydrate`. `filters` is required. Set `limit` ≤ 20.
 * @returns A {@link Paginator} of `{ id: string; data: T | null }[]` pages.
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
 *   limit:     20,
 * })) {
 *   for (const { id, data } of page.data) {
 *     console.log(id, data?.title, data?.price);
 *   }
 * }
 * ```
 */
export function paginateSearchHydrated<T = unknown, SP extends SearchParams = SearchParams>(
  client: AnyClient,
  options: Omit<SearchOptions<SP>, "cursor" | "hydrate">,
): Paginator<{ id: string; data: T | null }> {
  const fetcher: PageFetcher<{ id: string; data: T | null }> = async (cursor) => {
    const result = await (client as FlexDBClient).search<T, SP>({
      ...options,
      cursor,
      hydrate: true,
    } as SearchOptions<SP> & { hydrate: true });

    const r = result as ListItemsResult<T>;
    return { data: r.items,...(r.nextCursor ? { nextCursor: r.nextCursor } : {}) };
  };

  return new Paginator(fetcher);
}