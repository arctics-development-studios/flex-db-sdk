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

export class FlexDBClient {
  readonly #baseUrl: string;
  readonly #authHeader: string;
  readonly #namespace: string | undefined;
  readonly #retry: RetryConfig | false;

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
   * Ping the service. No auth required.
   * Useful for liveness probes and SDK sanity-checks.
   *
   * @returns `{ status: "ok" }` when healthy.
   */
  async health(): Promise<{ status: string }> {
    return this.#request({ method: "GET", path: "/health" });
  }

  // ── Create ────────────────────────────────────────────────────────────────

  /**
   * Creates a new item with a **server-generated** NanoID key.
   *
   * @param value   Any JSON-serialisable object to store.
   * @param options Operation-level overrides.
   * @returns       `{ success: true, key: "..." }` — keep the key!
   *
   * @example
   * const { key } = await db.create({ name: "Alice", age: 30 }, {
   *   namespace: "users",
   *   searchParams: { age: 30, role: "admin" },
   * });
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
   * Retrieves an item by its unique key.
   *
   * @param key     The NanoID returned from `create()` or provided to `set()`.
   * @param options Operation-level overrides.
   *
   * @example
   * const { item } = await db.get<User>("abc123", { namespace: "users" });
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
   * Creates the item if it does not exist; overwrites it if it does.
   *
   * @param key     Any string key you control (e.g. a user ID).
   * @param value   Any JSON-serialisable object.
   * @param options Operation-level overrides.
   *
   * @example
   * await db.set("user-42", { name: "Bob" }, {
   *   namespace: "users",
   *   searchParams: { role: "viewer" },
   * });
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
   * @param key     The key of the item to delete.
   * @param options Operation-level overrides.
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
   * Lists items in the namespace, returning only their keys.
   *
   * @example
   * const { ids, nextCursor } = await db.list({ limit: 50 });
   */
  async list(options?: ListOptions & { hydrate?: false }): Promise<ListIdsResult>;

  /**
   * Lists items in the namespace, returning full objects.
   * Only available when `limit` is ≤ 20.
   *
   * @example
   * const { items } = await db.list<User>({ hydrate: true, limit: 20 });
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
   * Searches for items using indexed fields set via `searchParams`.
   * Returns only item keys by default.
   *
   * @example
   * const { ids } = await db.search({
   *   filters: { price: { gte: 10, lte: 50 }, category: { eq: "books" } },
   *   namespace: "products",
   * });
   */
  async search<SP extends SearchParams = SearchParams>(
    options: SearchOptions<SP> & { hydrate?: false },
  ): Promise<ListIdsResult>;

  /**
   * Searches for items and returns their full data.
   * Only available when `limit` is ≤ 20.
   *
   * @example
   * const { items } = await db.search<Product, ProductSP>({
   *   filters: { category: { sw: "elec" } },
   *   hydrate: true,
   *   limit: 10,
   * });
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
   * Returns a namespace-bound helper that bakes in the `namespace` so
   * you never have to repeat it across calls.
   *
   * @example
   * const users = db.namespace("users");
   * const { key }  = await users.create({ name: "Alice" });
   * const { item } = await users.get<User>(key);
   */
  namespace<DefaultSP extends SearchParams = SearchParams>(ns: string): NamespacedClient<DefaultSP> {
    return new NamespacedClient<DefaultSP>(this, ns);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  NamespacedClient
//  Thin facade that injects a fixed namespace into every call.
// ─────────────────────────────────────────────────────────────────────────────

export class NamespacedClient<DefaultSP extends SearchParams = SearchParams> {
  readonly #client: FlexDBClient;
  readonly #namespace: string;

  /** @internal */
  constructor(client: FlexDBClient, namespace: string) {
    this.#client    = client;
    this.#namespace = namespace;
  }

  // Delegate everything, injecting the fixed namespace

  create<T extends object, SP extends SearchParams = DefaultSP>(
    value: T,
    options?: Omit<SetOptions<SP>, "namespace">,
  ): Promise<CreateResult> {
    return this.#client.create(value, { ...options, namespace: this.#namespace });
  }

  get<T = unknown>(
    key: string,
    options?: Omit<GetOptions, "namespace">,
  ): Promise<GetResult<T>> {
    return this.#client.get<T>(key, { ...options, namespace: this.#namespace });
  }

  set<T extends object, SP extends SearchParams = DefaultSP>(
    key: string,
    value: T,
    options?: Omit<SetOptions<SP>, "namespace">,
  ): Promise<SetResult> {
    return this.#client.set(key, value, { ...options, namespace: this.#namespace });
  }

  delete(
    key: string,
    options?: Omit<DeleteOptions, "namespace">,
  ): Promise<DeleteResult> {
    return this.#client.delete(key, { ...options, namespace: this.#namespace });
  }

  list(options?: Omit<ListOptions, "namespace"> & { hydrate?: false }): Promise<ListIdsResult>;
  list<T = unknown>(options: Omit<ListOptions, "namespace"> & { hydrate: true }): Promise<ListItemsResult<T>>;
  list<T = unknown>(options?: Omit<ListOptions, "namespace">): Promise<ListIdsResult | ListItemsResult<T>> {
    return this.#client.list<T>({ ...options, namespace: this.#namespace } as any);
  }

  search<SP extends SearchParams = DefaultSP>(
    options: Omit<SearchOptions<SP>, "namespace"> & { hydrate?: false },
  ): Promise<ListIdsResult>;
  search<T = unknown, SP extends SearchParams = DefaultSP>(
    options: Omit<SearchOptions<SP>, "namespace"> & { hydrate: true },
  ): Promise<ListItemsResult<T>>;
  search<T = unknown, SP extends SearchParams = DefaultSP>(
    options: Omit<SearchOptions<SP>, "namespace">,
  ): Promise<ListIdsResult | ListItemsResult<T>> {
    return this.#client.search<T, SP>({ ...options, namespace: this.#namespace } as any);
  }
}