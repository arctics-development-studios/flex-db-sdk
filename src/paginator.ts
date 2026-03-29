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
 * Async-iterable paginator.
 * Yields one **page** at a time; you decide when to stop.
 *
 * @example — iterate every page
 * for await (const page of paginator) {
 *   console.log(page.data);          // current page items
 *   console.log(page.cursor);        // opaque token for this page's position
 *   console.log(page.hasMore);       // false on the last page
 * }
 *
 * @example — collect all items across all pages
 * const all = await paginator.all();
 */
export class Paginator<T> implements AsyncIterable<Page<T>> {
  readonly #fetch: PageFetcher<T>;
  readonly #startCursor: string | undefined;

  /** @internal */
  constructor(fetch: PageFetcher<T>, startCursor?: string) {
    this.#fetch       = fetch;
    this.#startCursor = startCursor;
  }

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
   * Collects every item across all pages into a flat array.
   * Use with care on large datasets — this loads everything into memory.
   */
  async all(): Promise<T[]> {
    const collected: T[] = [];
    for await (const page of this) {
      collected.push(...page.data);
    }
    return collected;
  }

  /**
   * Calls `fn` for each individual item across all pages.
   *
   * @example
   * await paginator.forEach(item => console.log(item));
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

/** A single page of results from the paginator. */
export interface Page<T> {
  /** Items on this page. */
  data: T[];
  /**
   * Opaque cursor pointing to the *next* page.
   * `undefined` on the last page.
   */
  cursor: string | undefined;
  /** Convenience flag — `false` when this is the last page. */
  hasMore: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Factory helpers
// ─────────────────────────────────────────────────────────────────────────────

type AnyClient = FlexDBClient | NamespacedClient<any>;

/**
 * Creates a `Paginator` that iterates through `list()` pages, yielding **IDs**.
 *
 * @example
 * const pages = paginateList(db, { namespace: "users", limit: 50 });
 * for await (const page of pages) {
 *   console.log(page.data); // string[]
 * }
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
 * Creates a `Paginator` that iterates through `list()` pages, yielding **full objects**.
 * Requires `limit` ≤ 20 (server constraint).
 *
 * @example
 * const pages = paginateListHydrated<User>(db, { namespace: "users", limit: 20 });
 * for await (const page of pages) {
 *   console.log(page.data); // { id: string; data: User | null }[]
 * }
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
 * Creates a `Paginator` that iterates through `search()` pages, yielding **IDs**.
 *
 * @example
 * const pages = paginateSearch(db, {
 *   namespace: "products",
 *   filters: { category: { eq: "books" } },
 * });
 * for await (const page of pages) {
 *   console.log(page.data); // string[]
 * }
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
 * Creates a `Paginator` that iterates through `search()` pages, yielding **full objects**.
 * Requires `limit` ≤ 20 (server constraint).
 *
 * @example
 * const pages = paginateSearchHydrated<Product>(db, {
 *   namespace: "products",
 *   filters: { price: { lte: 100 } },
 *   limit: 20,
 * });
 * for await (const page of pages) {
 *   console.log(page.data); // { id: string; data: Product | null }[]
 * }
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