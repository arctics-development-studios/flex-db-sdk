/**
 * Core client classes for the FlexDB SDK.
 *
 * Use {@link createClient} (from the root module) to instantiate a
 * {@link FlexDBClient}. For namespace-scoped access, call
 * {@link FlexDBClient.namespace} to obtain a {@link NamespacedClient}.
 *
 * @module
 */

// ─────────────────────────────────────────────
//  FlexDB SDK · Client
//  The primary interface. Create once, use everywhere.
// ─────────────────────────────────────────────

import { request, DEFAULT_RETRY } from "./transport.ts";
import type { RequestOptions } from "./transport.ts";
import type {
  FlexDBClientOptions,
  RetryConfig,
  OperationOptions,
  SearchParams,
  Filters,
  SetOptions,
  GetOptions,
  DeleteOptions,
  ListOptions,
  SearchOptions,
  CreateResult,
  SetResult,
  GetResult,
  DeleteResult,
  ListIdsResult,
  ListItemsResult,
} from "./types.ts";

// ─────────────────────────────────────────────────────────────────────────────
//  FlexDBClient
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The primary FlexDB client. Create a single instance at module scope and
 * reuse it across your application for maximum performance.
 *
 * Use {@link createClient} rather than instantiating this class directly:
 *
 * ```ts
 * import { createClient } from "@arctics/flex-db-sdk";
 *
 * const db = createClient({
 *   apiKey:    Deno.env.get("FLEXDB_API_KEY")!,
 *   baseUrl:   "https://eu.flex.arctics.dev",
 *   namespace: "users",
 * });
 * ```
 *
 * ### Namespace binding
 *
 * For domain-specific code, bind a namespace once with {@link namespace}
 * and stop repeating it on every call:
 *
 * ```ts
 * const users    = db.namespace("users");
 * const products = db.namespace<ProductSP>("products");
 *
 * const { key }  = await users.create({ name: "Alice" });
 * const { item } = await users.get<User>(key);
 * ```
 *
 * ### Error handling
 *
 * ```ts
 * import { FlexDBError, FlexDBNetworkError } from "@arctics/flex-db-sdk";
 *
 * try {
 *   await db.get("missing-key");
 * } catch (err) {
 *   if (err instanceof FlexDBError)        console.error(err.status, err.body);
 *   if (err instanceof FlexDBNetworkError) console.error("Network:", err.cause);
 * }
 * ```
 */
export class FlexDBClient {
  readonly #baseUrl: string;
  readonly #authHeader: string;
  readonly #namespace: string | undefined;
  readonly #retry: RetryConfig | false;

  /**
   * @param options - Client configuration. See {@link FlexDBClientOptions}.
   * @throws `Error` if `apiKey` or `baseUrl` is missing.
   */
  constructor(options: FlexDBClientOptions) {
    if (!options.apiKey)  throw new Error("[FlexDB] apiKey is required.");
    if (!options.baseUrl) throw new Error("[FlexDB] baseUrl is required.");

    this.#baseUrl    = options.baseUrl.replace(/\/$/, "");
    this.#authHeader = `Bearer ${options.apiKey}`;
    this.#namespace  = options.namespace;
    this.#retry      = options.retry === false
      ? false
      : { ...DEFAULT_RETRY, ...(options.retry ?? {}) };
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  /** Resolves the namespace, throwing if neither option nor default is set. */
  #ns(opts?: OperationOptions): string {
    const ns = opts?.namespace ?? this.#namespace;
    if (!ns) {
      throw new Error(
        "[FlexDB] No namespace provided. " +
        "Set a default on the client or pass `namespace` in the operation options.",
      );
    }
    return ns;
  }

    /** Central request dispatcher — keeps call-sites clean. */
    #request<T>(opts: RequestOptions, opOptions?: OperationOptions): Promise<T> {
        const finalOptions: RequestOptions = { ...opts };

        if (opOptions?.signal) {
            finalOptions.signal = opOptions.signal;
        }

        return request<T>(this.#baseUrl, this.#authHeader, finalOptions, this.#retry);
    }

  // ── Health ────────────────────────────────────────────────────────────────

  /**
   * Pings the FlexDB service to verify it is reachable and healthy.
   * Authentication is **not** required for this endpoint.
   *
   * Useful for liveness probes, CI smoke tests, and SDK sanity-checks
   * before handling real traffic.
   *
   * @returns `{ status: "ok" }` when the service is healthy.
   *
   * @example
   * ```ts
   * const { status } = await db.health();
   * console.log(status); // "ok"
   * ```
   */
  async health(): Promise<{ status: string }> {
    return this.#request({ method: "GET", path: "/health" });
  }

  // ── Create ────────────────────────────────────────────────────────────────

  /**
   * Creates a new item and stores it under a **server-generated** NanoID key.
   *
   * Use this when you do not need to control the key yourself. If you want to
   * supply your own key (e.g. a user ID), use {@link set} instead.
   *
   * To make the item queryable later, pass `searchParams` with the fields you
   * want to index. These are stored separately from `value` and power all
   * {@link search} queries.
   *
   * @param value   - Any JSON-serialisable object to store.
   * @param options - Optional namespace, search params, and abort signal.
   * @returns `{ success: true, key }` — store the `key`, it is the only way to retrieve this item.
   *
   * @example Store a user
   * ```ts
   * const { key } = await db.create(
   *   { name: "Alice", age: 30 },
   *   { namespace: "users" },
   * );
   * console.log(key); // "V1StGXR8_Z5jdHi6B-myT"
   * ```
   *
   * @example Store a product with indexed search fields
   * ```ts
   * const { key } = await db.create(
   *   { title: "Widget Pro", price: 49.99 },
   *   {
   *     namespace:    "products",
   *     searchParams: { price: 49.99, category: "electronics", inStock: true },
   *   },
   * );
   * ```
   */
  async create<T extends object, SP extends SearchParams = SearchParams>(
    value: T,
    options?: SetOptions<SP>,
  ): Promise<CreateResult> {
    const headers: Record<string, string> = {
      "X-Namespace": this.#ns(options),
    };

    if (options?.searchParams) {
      headers["X-Search-Params"] = JSON.stringify(options.searchParams);
    }

    return this.#request<CreateResult>(
      { method: "POST", path: "/v1", headers, body: value },
      options,
    );
  }

  // ── Get ───────────────────────────────────────────────────────────────────

  /**
   * Retrieves a single item by its unique key.
   *
   * Supply the data type as a generic parameter to get a fully-typed result:
   * ```ts
   * const { item } = await db.get<User>("abc123");
   * console.log(item.name); // TypeScript knows this is a string
   * ```
   *
   * @param key     - The NanoID returned from {@link create} or the key you passed to {@link set}.
   * @param options - Optional namespace override and abort signal.
   * @returns `{ success: true, item: T }` with the stored object.
   *
   * @throws {@link FlexDBError} with `status === 404` if the key does not exist.
   * @throws {@link FlexDBError} with `status === 401` if the API key is invalid.
   *
   * @example Basic get
   * ```ts
   * const { item } = await db.get<User>("abc123", { namespace: "users" });
   * console.log(item.name, item.age);
   * ```
   *
   * @example With cancellation
   * ```ts
   * const controller = new AbortController();
   * setTimeout(() => controller.abort(), 3_000);
   *
   * const { item } = await db.get<User>("abc123", {
   *   namespace: "users",
   *   signal:    controller.signal,
   * });
   * ```
   */
  async get<T = unknown>(
    key: string,
    options?: GetOptions,
  ): Promise<GetResult<T>> {
    return this.#request<GetResult<T>>(
      {
        method: "GET",
        path: `/v1/${encodeURIComponent(key)}`,
        headers: { "X-Namespace": this.#ns(options) },
      },
      options,
    );
  }

  // ── Set (upsert with caller-supplied key) ─────────────────────────────────

  /**
   * Upserts an item at a **caller-supplied** key.
   *
   * - If the key does not yet exist, a new item is created.
   * - If the key already exists, the stored value is **overwritten** entirely.
   *
   * Use this when you control the key — for example, storing a record under
   * a user's UUID or a slug. For server-generated keys, use {@link create}.
   *
   * @param key     - Your chosen key. Any non-empty string is valid.
   * @param value   - Any JSON-serialisable object.
   * @param options - Optional namespace, search params, and abort signal.
   * @returns `{ success: true, key }`.
   *
   * @example Upsert by user ID
   * ```ts
   * await db.set(
   *   "user-42",
   *   { name: "Bob", age: 25 },
   *   { namespace: "users", searchParams: { age: 25, role: "viewer" } },
   * );
   * ```
   *
   * @example Update an existing record
   * ```ts
   * // Overwrites the entire stored object — not a partial patch
   * await db.set("user-42", { name: "Bob", age: 26 }, { namespace: "users" });
   * ```
   */
  async set<T extends object, SP extends SearchParams = SearchParams>(
    key: string,
    value: T,
    options?: SetOptions<SP>,
  ): Promise<SetResult> {
    const headers: Record<string, string> = {
      "X-Namespace": this.#ns(options),
    };

    if (options?.searchParams) {
      headers["X-Search-Params"] = JSON.stringify(options.searchParams);
    }

    return this.#request<SetResult>(
      {
        method: "PUT",
        path: `/v1/${encodeURIComponent(key)}`,
        headers,
        body: value,
      },
      options,
    );
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  /**
   * Permanently removes an item from the store.
   *
   * This operation is **irreversible**. Both the item data and its search index
   * entries are deleted.
   *
   * @param key     - The key of the item to delete.
   * @param options - Optional namespace override and abort signal.
   * @returns `{ success: true }`.
   *
   * @throws {@link FlexDBError} with `status === 404` if the key does not exist.
   *
   * @example
   * ```ts
   * await db.delete("user-42", { namespace: "users" });
   * ```
   */
  async delete(key: string, options?: DeleteOptions): Promise<DeleteResult> {
    return this.#request<DeleteResult>(
      {
        method: "DELETE",
        path: `/v1/${encodeURIComponent(key)}`,
        headers: { "X-Namespace": this.#ns(options) },
      },
      options,
    );
  }

  // ── List ──────────────────────────────────────────────────────────────────

  /**
   * Lists items in the namespace, returning only their **keys** (IDs).
   *
   * Use the async-iterable {@link paginateList} helper to page through large
   * collections without manual cursor management:
   * ```ts
   * for await (const page of paginateList(db, { namespace: "users" })) {
   *   console.log(page.data); // string[]
   * }
   * ```
   *
   * @param options - Pagination options. `hydrate` must be `false` or omitted.
   * @returns {@link ListIdsResult} — `{ ids, nextCursor? }`.
   *
   * @example Manual cursor pagination
   * ```ts
   * let cursor: string | undefined;
   * do {
   *   const result = await db.list({ namespace: "users", limit: 50, cursor });
   *   console.log(result.ids);
   *   cursor = result.nextCursor;
   * } while (cursor);
   * ```
   */
  async list(options?: ListOptions & { hydrate?: false }): Promise<ListIdsResult>;

  /**
   * Lists items in the namespace, returning their **full data objects**.
   *
   * Only available when `limit` is ≤ 20 (server constraint).
   * Each result entry is `{ id: string; data: T | null }` — `data` may be
   * `null` for items concurrently deleted between index and fetch.
   *
   * Use {@link paginateListHydrated} for automatic pagination:
   * ```ts
   * for await (const page of paginateListHydrated<User>(db, { namespace: "users", limit: 20 })) {
   *   for (const { id, data } of page.data) console.log(id, data?.name);
   * }
   * ```
   *
   * @param options - Must include `hydrate: true`. `limit` must be ≤ 20.
   * @returns {@link ListItemsResult} — `{ items, nextCursor? }`.
   *
   * @example
   * ```ts
   * const { items } = await db.list<User>({ namespace: "users", hydrate: true, limit: 20 });
   * for (const { id, data } of items) {
   *   console.log(id, data?.name);
   * }
   * ```
   */
  async list<T = unknown>(options: ListOptions & { hydrate: true }): Promise<ListItemsResult<T>>;

  async list<T = unknown>(
    options?: ListOptions,
  ): Promise<ListIdsResult | ListItemsResult<T>> {
    const headers: Record<string, string> = {
      "X-Namespace": this.#ns(options),
    };

    if (options?.hydrate) {
      headers["X-Full-Object"] = "true";
    }

    const query: Record<string, string | number | boolean | undefined> = {
      limit: options?.limit,
      cursor: options?.cursor,
    };

    return this.#request<ListIdsResult | ListItemsResult<T>>(
      { method: "GET", path: "/v1/list", headers, query },
      options,
    );
  }

  // ── Search ────────────────────────────────────────────────────────────────

  /**
   * Searches for items using fields previously indexed via `searchParams`,
   * returning only their **keys** (IDs).
   *
   * Provide your `SearchParams` interface as the generic `SP` to get
   * compile-time validation of filter keys and value types:
   * ```ts
   * interface ProductSP { price: number; category: string; }
   * const { ids } = await db.search<ProductSP>({ filters: { price: { gte: 10 } } });
   * ```
   *
   * Use {@link paginateSearch} to iterate over large result sets automatically.
   *
   * @param options - Must include `filters`. `hydrate` must be `false` or omitted.
   * @returns {@link ListIdsResult} — `{ ids, nextCursor? }`.
   *
   * @example Filter by price range and category
   * ```ts
   * const { ids } = await db.search({
   *   namespace: "products",
   *   filters: {
   *     price:    { gte: 10, lte: 100 },
   *     category: { eq: "electronics" },
   *   },
   * });
   * ```
   */
  async search<SP extends SearchParams = SearchParams>(
    options: SearchOptions<SP> & { hydrate?: false },
  ): Promise<ListIdsResult>;

  /**
   * Searches for items and returns their **full data objects**.
   *
   * Only available when `limit` is ≤ 20 (server constraint).
   * Supply both data type `T` and search-params type `SP` for full end-to-end typing.
   *
   * Use {@link paginateSearchHydrated} to iterate over large result sets automatically.
   *
   * @param options - Must include `filters` and `hydrate: true`. `limit` must be ≤ 20.
   * @returns {@link ListItemsResult} — `{ items, nextCursor? }`.
   *
   * @example
   * ```ts
   * interface Product   { title: string; price: number; }
   * interface ProductSP { price: number; category: string; }
   *
   * const { items } = await db.search<Product, ProductSP>({
   *   namespace: "products",
   *   filters:   { category: { sw: "elec" } },
   *   hydrate:   true,
   *   limit:     10,
   * });
   *
   * for (const { id, data } of items) {
   *   console.log(id, data?.title, data?.price);
   * }
   * ```
   */
  async search<T = unknown, SP extends SearchParams = SearchParams>(
    options: SearchOptions<SP> & { hydrate: true },
  ): Promise<ListItemsResult<T>>;

  async search<T = unknown, SP extends SearchParams = SearchParams>(
    options: SearchOptions<SP>,
  ): Promise<ListIdsResult | ListItemsResult<T>> {
    const headers: Record<string, string> = {
      "X-Namespace": this.#ns(options),
    };

    if (options.hydrate) {
      headers["X-Full-Object"] = "true";
    }

    const query: Record<string, string | number | boolean | undefined> = {
      limit: options.limit,
      cursor: options.cursor,
    };

    return this.#request<ListIdsResult | ListItemsResult<T>>(
      { method: "POST", path: "/v1/search", headers, query, body: options.filters },
      options,
    );
  }

  // ── Namespace binding ─────────────────────────────────────────────────────

  /**
   * Returns a {@link NamespacedClient} with `ns` baked in to every operation.
   *
   * This is the recommended pattern for domain-specific modules — bind once,
   * then call methods without ever specifying `namespace` again.
   *
   * Optionally supply a `SearchParams` type as `DefaultSP` to type-check
   * `searchParams` and `filters` throughout the bound client:
   * ```ts
   * interface ProductSP { price: number; category: string; }
   * const products = db.namespace<ProductSP>("products");
   * // TypeScript now validates filter keys and value types on every search call
   * ```
   *
   * @param ns - The namespace (collection) name to bind.
   * @returns A {@link NamespacedClient} pre-configured with `ns`.
   *
   * @example Bind multiple namespaces
   * ```ts
   * const users    = db.namespace("users");
   * const products = db.namespace<ProductSP>("products");
   *
   * const { key }  = await users.create({ name: "Alice" });
   * const { item } = await users.get<User>(key);
   *
   * await products.create(
   *   { title: "Widget", price: 9.99 },
   *   { searchParams: { price: 9.99, category: "tools" } },
   * );
   * ```
   */
  namespace<DefaultSP extends SearchParams = SearchParams>(ns: string): NamespacedClient<DefaultSP> {
    return new NamespacedClient<DefaultSP>(this, ns);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  NamespacedClient
//  Thin facade that injects a fixed namespace into every call.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A thin wrapper around {@link FlexDBClient} that automatically injects a
 * fixed namespace into every operation.
 *
 * Obtain an instance by calling {@link FlexDBClient.namespace}:
 * ```ts
 * const users = db.namespace("users");
 * const { key }  = await users.create({ name: "Alice" });
 * const { item } = await users.get<User>(key);
 * ```
 *
 * Supply a `SearchParams` type as `DefaultSP` to enable type-checking of
 * `searchParams` on writes and `filters` on searches:
 * ```ts
 * interface UserSP { age: number; role: "admin" | "viewer"; }
 * const users = db.namespace<UserSP>("users");
 *
 * // TypeScript validates filter keys and value types
 * const { ids } = await users.search({
 *   filters: { age: { gte: 18 }, role: { eq: "admin" } },
 * });
 * ```
 */
export class NamespacedClient<DefaultSP extends SearchParams = SearchParams> {
  readonly #client: FlexDBClient;
  readonly #namespace: string;

  /**
   * @internal Use {@link FlexDBClient.namespace} instead.
   */
  constructor(client: FlexDBClient, namespace: string) {
    this.#client    = client;
    this.#namespace = namespace;
  }

  /**
   * Creates a new item with a server-generated key in the bound namespace.
   * See {@link FlexDBClient.create} for full documentation.
   *
   * @param value   - Any JSON-serialisable object.
   * @param options - Optional search params and abort signal (namespace is already bound).
   *
   * @example
   * ```ts
   * const users = db.namespace("users");
   * const { key } = await users.create({ name: "Alice", age: 30 });
   * ```
   */
  create<T extends object, SP extends SearchParams = DefaultSP>(
    value: T,
    options?: Omit<SetOptions<SP>, "namespace">,
  ): Promise<CreateResult> {
    return this.#client.create(value, { ...options, namespace: this.#namespace });
  }

  /**
   * Retrieves an item by key from the bound namespace.
   * See {@link FlexDBClient.get} for full documentation.
   *
   * @param key     - The item key.
   * @param options - Optional abort signal (namespace is already bound).
   *
   * @example
   * ```ts
   * const users = db.namespace("users");
   * const { item } = await users.get<User>("abc123");
   * ```
   */
  get<T = unknown>(
    key: string,
    options?: Omit<GetOptions, "namespace">,
  ): Promise<GetResult<T>> {
    return this.#client.get<T>(key, { ...options, namespace: this.#namespace });
  }

  /**
   * Upserts an item at a caller-supplied key in the bound namespace.
   * See {@link FlexDBClient.set} for full documentation.
   *
   * @param key     - Your chosen key.
   * @param value   - Any JSON-serialisable object.
   * @param options - Optional search params and abort signal (namespace is already bound).
   *
   * @example
   * ```ts
   * const users = db.namespace("users");
   * await users.set("user-42", { name: "Bob", age: 25 });
   * ```
   */
  set<T extends object, SP extends SearchParams = DefaultSP>(
    key: string,
    value: T,
    options?: Omit<SetOptions<SP>, "namespace">,
  ): Promise<SetResult> {
    return this.#client.set(key, value, { ...options, namespace: this.#namespace });
  }

  /**
   * Permanently removes an item from the bound namespace.
   * See {@link FlexDBClient.delete} for full documentation.
   *
   * @param key     - The item key to delete.
   * @param options - Optional abort signal (namespace is already bound).
   *
   * @example
   * ```ts
   * const users = db.namespace("users");
   * await users.delete("user-42");
   * ```
   */
  delete(
    key: string,
    options?: Omit<DeleteOptions, "namespace">,
  ): Promise<DeleteResult> {
    return this.#client.delete(key, { ...options, namespace: this.#namespace });
  }

  /**
   * Lists item keys in the bound namespace.
   * See {@link FlexDBClient.list} for full documentation.
   *
   * @example
   * ```ts
   * const users = db.namespace("users");
   * const { ids, nextCursor } = await users.list({ limit: 50 });
   * ```
   */
  list(options?: Omit<ListOptions, "namespace"> & { hydrate?: false }): Promise<ListIdsResult>;

  /**
   * Lists full item objects in the bound namespace (`limit` must be ≤ 20).
   * See {@link FlexDBClient.list} for full documentation.
   *
   * @example
   * ```ts
   * const users = db.namespace("users");
   * const { items } = await users.list<User>({ hydrate: true, limit: 20 });
   * ```
   */
  list<T = unknown>(options: Omit<ListOptions, "namespace"> & { hydrate: true }): Promise<ListItemsResult<T>>;

  list<T = unknown>(options?: Omit<ListOptions, "namespace">): Promise<ListIdsResult | ListItemsResult<T>> {
    return this.#client.list<T>({ ...options, namespace: this.#namespace } as any);
  }

  /**
   * Searches for items by indexed fields in the bound namespace, returning their keys.
   * See {@link FlexDBClient.search} for full documentation.
   *
   * @example
   * ```ts
   * const products = db.namespace<ProductSP>("products");
   * const { ids } = await products.search({
   *   filters: { price: { lte: 50 }, category: { eq: "books" } },
   * });
   * ```
   */
  search<SP extends SearchParams = DefaultSP>(
    options: Omit<SearchOptions<SP>, "namespace"> & { hydrate?: false },
  ): Promise<ListIdsResult>;

  /**
   * Searches for items by indexed fields in the bound namespace, returning full objects.
   * `limit` must be ≤ 20. See {@link FlexDBClient.search} for full documentation.
   *
   * @example
   * ```ts
   * const products = db.namespace<ProductSP>("products");
   * const { items } = await products.search<Product>({
   *   filters: { category: { sw: "elec" } },
   *   hydrate: true,
   *   limit:   10,
   * });
   * ```
   */
  search<T = unknown, SP extends SearchParams = DefaultSP>(
    options: Omit<SearchOptions<SP>, "namespace"> & { hydrate: true },
  ): Promise<ListItemsResult<T>>;

  search<T = unknown, SP extends SearchParams = DefaultSP>(
    options: Omit<SearchOptions<SP>, "namespace">,
  ): Promise<ListIdsResult | ListItemsResult<T>> {
    return this.#client.search<T, SP>({ ...options, namespace: this.#namespace } as any);
  }
}