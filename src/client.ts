/**
 * # Core Client
 *
 * Primary client implementation for the FlexDB SDK.
 *
 * Use {@link createClient} (from the root module) to instantiate a
 * {@link FlexDBClient}. For namespace-scoped operations, call
 * {@link FlexDBClient.namespace} to create a {@link NamespacedClient}.
 *
 * ```ts
 * import { createClient } from "@arctics/flex-db-sdk";
 *
 * const db = createClient({ apiKey: "...", baseUrl: "..." });
 * const users = db.namespace("users");
 *
 * const { key }  = await users.create({ name: "Alice" });
 * const { data } = await users.get<User>(key);
 * ```
 *
 * @module
 */

// ─────────────────────────────────────────────
//  FlexDB SDK · Client
//  The primary interface. Create once, use everywhere.
// ─────────────────────────────────────────────

import { request, DEFAULT_RETRY, clampLimit } from "./transport.ts";
import type { RequestOptions } from "./transport.ts";
import type {
  FlexDBClientOptions,
  RetryConfig,
  OperationOptions,
  SearchParams,
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
 * const { data } = await users.get<User>(key);
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
 *   if (err instanceof FlexDBError) {
 *     console.error(err.code, err.status, err.hint);
 *   }
 *   if (err instanceof FlexDBNetworkError) {
 *     console.error("Network:", err.cause);
 *   }
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

  /** Resolves the namespace, throwing if neither per-call option nor client default is set. */
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
   * Creates a new object and stores it under a **server-generated** NanoID key.
   *
   * Use this when you do not need to control the key yourself. If you want to
   * supply your own key (e.g. a user ID), use {@link set} instead.
   *
   * To make the object queryable later, pass `metadata` with the fields you
   * want to index. These are stored alongside the object and power all
   * {@link search} queries.
   *
   * @param value   - Any JSON-serialisable value to store.
   * @param options - Optional namespace, metadata, and abort signal.
   * @returns `{ v: 1, ok: true, key }` — store the `key`, it is the only way to access this object.
   *
   * @example Store an object
   * ```ts
   * const { key } = await db.create(
   *   { name: "Alice", age: 30 },
   *   { namespace: "users" },
   * );
   * console.log(key); // "V1StGXR8_Z5jdHi6B-myT"
   * ```
   *
   * @example Store an object with indexed metadata
   * ```ts
   * const { key } = await db.create(
   *   { title: "Widget Pro", price: 49.99 },
   *   {
   *     namespace: "products",
   *     metadata:  { price: 49.99, category: "electronics", inStock: true },
   *   },
   * );
   * ```
   */
  async create<T, SP extends SearchParams = SearchParams>(
    value: T,
    options?: SetOptions<SP>,
  ): Promise<CreateResult> {
    const body: Record<string, unknown> = { data: value };
    if (options?.metadata !== undefined) {
      body.metadata = options.metadata;
    }

    return this.#request<CreateResult>(
      {
        method: "POST",
        path: "/v1",
        headers: { "X-Namespace": this.#ns(options) },
        body,
      },
      options,
    );
  }

  // ── Get ───────────────────────────────────────────────────────────────────

  /**
   * Retrieves a single object by its key.
   *
   * Supply the data type as a generic parameter to get a fully-typed result:
   * ```ts
   * const { data } = await db.get<User>("abc123");
   * console.log(data.name); // TypeScript knows this is a string
   * ```
   *
   * @param key     - The NanoID returned from {@link create} or the key you passed to {@link set}.
   * @param options - Optional namespace override and abort signal.
   * @returns `{ v: 1, ok: true, data: T }` with the stored object.
   *
   * @throws {@link FlexDBError} with `code === "ERR_NOT_FOUND"` if the key does not exist.
   * @throws {@link FlexDBError} with `code === "ERR_UNAUTHORIZED"` if the API key is invalid.
   *
   * @example Basic get
   * ```ts
   * const { data } = await db.get<User>("abc123", { namespace: "users" });
   * console.log(data.name, data.age);
   * ```
   *
   * @example With cancellation
   * ```ts
   * const controller = new AbortController();
   * setTimeout(() => controller.abort(), 3_000);
   *
   * const { data } = await db.get<User>("abc123", {
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
   * Upserts an object at a **caller-supplied** key.
   *
   * - If the key does not yet exist, a new object is created.
   * - If the key already exists, the stored value and metadata are **fully replaced**.
   *
   * Use this when you control the key — for example, storing a record under
   * a user's UUID or a slug. For server-generated keys, use {@link create}.
   *
   * Tier assignment is recalculated based on the new payload size on every update.
   *
   * @param key     - Your chosen key. Any non-empty string is valid.
   * @param value   - Any JSON-serialisable value.
   * @param options - Optional namespace, metadata, and abort signal.
   * @returns `{ v: 1, ok: true, key }`.
   *
   * @example Upsert by user ID
   * ```ts
   * await db.set(
   *   "user-42",
   *   { name: "Bob", age: 25 },
   *   { namespace: "users", metadata: { age: 25, role: "viewer" } },
   * );
   * ```
   *
   * @example Update an existing record (full replace, not a partial patch)
   * ```ts
   * await db.set("user-42", { name: "Bob", age: 26 }, { namespace: "users" });
   * ```
   *
   * @example Clear all metadata on update
   * ```ts
   * await db.set("user-42", { name: "Bob" }, { namespace: "users", metadata: {} });
   * ```
   */
  async set<T, SP extends SearchParams = SearchParams>(
    key: string,
    value: T,
    options?: SetOptions<SP>,
  ): Promise<SetResult> {
    const body: Record<string, unknown> = { data: value };
    if (options?.metadata !== undefined) {
      body.metadata = options.metadata;
    }

    return this.#request<SetResult>(
      {
        method: "PUT",
        path: `/v1/${encodeURIComponent(key)}`,
        headers: { "X-Namespace": this.#ns(options) },
        body,
      },
      options,
    );
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  /**
   * Permanently removes an object and all its data across all storage tiers.
   *
   * This operation is **irreversible**. The object's data, metadata, and cache
   * entries are all deleted.
   *
   * @param key     - The key of the object to delete.
   * @param options - Optional namespace override and abort signal.
   * @returns `{ v: 1, ok: true }`.
   *
   * @throws {@link FlexDBError} with `code === "ERR_NOT_FOUND"` if the key does not exist.
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
   * Lists objects in the namespace, returning only their **keys**.
   *
   * Results are returned in lexicographic order by key within the namespace.
   * Use the async-iterable {@link paginateList} helper to page through large
   * collections without manual cursor management:
   * ```ts
   * for await (const page of paginateList(db, { namespace: "users" })) {
   *   console.log(page.data); // string[]
   * }
   * ```
   *
   * @param options - Pagination options. `hydrate` must be `false` or omitted.
   * @returns {@link ListIdsResult} — `{ v, ok, keys, count, cursor? }`.
   *
   * @example Manual cursor pagination
   * ```ts
   * let cursor: string | undefined;
   * do {
   *   const result = await db.list({ namespace: "users", limit: 50, cursor });
   *   console.log(result.keys);
   *   cursor = result.cursor;
   * } while (cursor);
   * ```
   */
  async list(options?: ListOptions & { hydrate?: false }): Promise<ListIdsResult>;

  /**
   * Lists objects in the namespace, returning their **full data objects**.
   *
   * Hydration is only activated by the server when `limit` ≤ 50. Each result
   * entry is `{ key: string; data: T | null }` — `data` may be `null` for
   * objects deleted between index scan and fetch.
   *
   * Use {@link paginateListHydrated} for automatic pagination:
   * ```ts
   * for await (const page of paginateListHydrated<User>(db, { namespace: "users", limit: 50 })) {
   *   for (const { key, data } of page.data) console.log(key, data?.name);
   * }
   * ```
   *
   * @param options - Must include `hydrate: true`. `limit` must be ≤ 50 to activate hydration.
   * @returns {@link ListItemsResult} — `{ v, ok, items, count, cursor? }`.
   *
   * @example
   * ```ts
   * const { items } = await db.list<User>({ namespace: "users", hydrate: true, limit: 50 });
   * for (const { key, data } of items) {
   *   console.log(key, data?.name);
   * }
   * ```
   */
  async list<T = unknown>(options: ListOptions & { hydrate: true }): Promise<ListItemsResult<T>>;

  async list<T = unknown>(
    options?: ListOptions,
  ): Promise<ListIdsResult | ListItemsResult<T>> {
    const query: Record<string, string | number | boolean | undefined> = {
      limit: options?.limit !== undefined ? clampLimit(options.limit) : undefined,
      cursor: options?.cursor,
    };

    if (options?.hydrate) {
      query.full = "true";
    }

    return this.#request<ListIdsResult | ListItemsResult<T>>(
      {
        method: "GET",
        path: "/v1/list",
        headers: { "X-Namespace": this.#ns(options) },
        query,
      },
      options,
    );
  }

  // ── Search ────────────────────────────────────────────────────────────────

  /**
   * Searches for objects using fields previously indexed via `metadata`,
   * returning only their **keys**.
   *
   * All filters are AND-ed together. An empty `filters` object `{}` returns
   * an empty result (not an error) — this is a server-side data-leak protection measure.
   *
   * Provide your metadata type as the generic `SP` to get compile-time validation
   * of filter keys and value types:
   * ```ts
   * interface ProductSP { price: number; category: string; }
   * const { keys } = await db.search<ProductSP>({ filters: { price: { gte: 10 } } });
   * ```
   *
   * Use {@link paginateSearch} to iterate over large result sets automatically.
   *
   * @param options - Must include `filters`. `hydrate` must be `false` or omitted.
   * @returns {@link ListIdsResult} — `{ v, ok, keys, count, cursor? }`.
   *
   * @example Filter by price range and category
   * ```ts
   * const { keys } = await db.search({
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
   * Searches for objects using indexed metadata and returns their **full data objects**.
   *
   * Hydration is only activated by the server when `limit` ≤ 50. Supply both data
   * type `T` and metadata type `SP` for full end-to-end typing.
   *
   * Use {@link paginateSearchHydrated} to iterate over large result sets automatically.
   *
   * @param options - Must include `filters` and `hydrate: true`. `limit` must be ≤ 50 to activate hydration.
   * @returns {@link ListItemsResult} — `{ v, ok, items, count, cursor? }`.
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
   * for (const { key, data } of items) {
   *   console.log(key, data?.title, data?.price);
   * }
   * ```
   */
  async search<T = unknown, SP extends SearchParams = SearchParams>(
    options: SearchOptions<SP> & { hydrate: true },
  ): Promise<ListItemsResult<T>>;

  async search<T = unknown, SP extends SearchParams = SearchParams>(
    options: SearchOptions<SP>,
  ): Promise<ListIdsResult | ListItemsResult<T>> {
    const query: Record<string, string | number | boolean | undefined> = {
      limit: options.limit !== undefined ? clampLimit(options.limit) : undefined,
      cursor: options.cursor,
    };

    if (options.hydrate) {
      query.full = "true";
    }

    return this.#request<ListIdsResult | ListItemsResult<T>>(
      {
        method: "POST",
        path: "/v1/search",
        headers: { "X-Namespace": this.#ns(options) },
        query,
        body: { filters: options.filters },
      },
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
   * Optionally supply a metadata type as `DefaultSP` to type-check `metadata`
   * on writes and `filters` on searches throughout the bound client:
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
   * const { data } = await users.get<User>(key);
   *
   * await products.create(
   *   { title: "Widget", price: 9.99 },
   *   { metadata: { price: 9.99, category: "tools" } },
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
 * const { data } = await users.get<User>(key);
 * ```
 *
 * Supply a metadata type as `DefaultSP` to enable type-checking of
 * `metadata` on writes and `filters` on searches:
 * ```ts
 * interface UserSP { age: number; role: "admin" | "viewer"; }
 * const users = db.namespace<UserSP>("users");
 *
 * // TypeScript validates filter keys and value types
 * const { keys } = await users.search({
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
   * Creates a new object with a server-generated key in the bound namespace.
   * See {@link FlexDBClient.create} for full documentation.
   *
   * @param value   - Any JSON-serialisable value.
   * @param options - Optional metadata and abort signal (namespace is already bound).
   *
   * @example
   * ```ts
   * const users = db.namespace("users");
   * const { key } = await users.create({ name: "Alice", age: 30 });
   * ```
   */
  create<T, SP extends SearchParams = DefaultSP>(
    value: T,
    options?: Omit<SetOptions<SP>, "namespace">,
  ): Promise<CreateResult> {
    return this.#client.create(value, { ...options, namespace: this.#namespace });
  }

  /**
   * Retrieves an object by key from the bound namespace.
   * See {@link FlexDBClient.get} for full documentation.
   *
   * @param key     - The object key.
   * @param options - Optional abort signal (namespace is already bound).
   *
   * @example
   * ```ts
   * const users = db.namespace("users");
   * const { data } = await users.get<User>("abc123");
   * ```
   */
  get<T = unknown>(
    key: string,
    options?: Omit<GetOptions, "namespace">,
  ): Promise<GetResult<T>> {
    return this.#client.get<T>(key, { ...options, namespace: this.#namespace });
  }

  /**
   * Upserts an object at a caller-supplied key in the bound namespace.
   * See {@link FlexDBClient.set} for full documentation.
   *
   * @param key     - Your chosen key.
   * @param value   - Any JSON-serialisable value.
   * @param options - Optional metadata and abort signal (namespace is already bound).
   *
   * @example
   * ```ts
   * const users = db.namespace("users");
   * await users.set("user-42", { name: "Bob", age: 25 });
   * ```
   */
  set<T, SP extends SearchParams = DefaultSP>(
    key: string,
    value: T,
    options?: Omit<SetOptions<SP>, "namespace">,
  ): Promise<SetResult> {
    return this.#client.set(key, value, { ...options, namespace: this.#namespace });
  }

  /**
   * Permanently removes an object from the bound namespace.
   * See {@link FlexDBClient.delete} for full documentation.
   *
   * @param key     - The object key to delete.
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
   * Lists object keys in the bound namespace.
   * See {@link FlexDBClient.list} for full documentation.
   *
   * @example
   * ```ts
   * const users = db.namespace("users");
   * const { keys, cursor } = await users.list({ limit: 50 });
   * ```
   */
  list(options?: Omit<ListOptions, "namespace"> & { hydrate?: false }): Promise<ListIdsResult>;

  /**
   * Lists full objects in the bound namespace. Hydration activates when `limit` ≤ 50.
   * See {@link FlexDBClient.list} for full documentation.
   *
   * @example
   * ```ts
   * const users = db.namespace("users");
   * const { items } = await users.list<User>({ hydrate: true, limit: 50 });
   * ```
   */
  list<T = unknown>(options: Omit<ListOptions, "namespace"> & { hydrate: true }): Promise<ListItemsResult<T>>;

  list<T = unknown>(options?: Omit<ListOptions, "namespace">): Promise<ListIdsResult | ListItemsResult<T>> {
    return this.#client.list<T>({ ...options, namespace: this.#namespace } as any);
  }

  /**
   * Searches for objects by indexed metadata fields in the bound namespace, returning their keys.
   * See {@link FlexDBClient.search} for full documentation.
   *
   * @example
   * ```ts
   * const products = db.namespace<ProductSP>("products");
   * const { keys } = await products.search({
   *   filters: { price: { lte: 50 }, category: { eq: "books" } },
   * });
   * ```
   */
  search<SP extends SearchParams = DefaultSP>(
    options: Omit<SearchOptions<SP>, "namespace"> & { hydrate?: false },
  ): Promise<ListIdsResult>;

  /**
   * Searches for objects by indexed metadata fields in the bound namespace, returning full objects.
   * Hydration activates when `limit` ≤ 50. See {@link FlexDBClient.search} for full documentation.
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
