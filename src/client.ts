/**
 * # Core Client
 *
 * Primary client implementation for the FlexDB SDK (API v2).
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
 * await users.set("user:42", { name: "Alice" });
 * const { data } = await users.get<User>("user:42");
 * ```
 *
 * @module
 */

import { request, DEFAULT_RETRY, clampLimit } from "./transport.ts";
import type { RequestOptions } from "./transport.ts";
import type {
  FlexDBClientOptions,
  RetryConfig,
  OperationOptions,
  SearchParams,
  Filters,
  CreateOptions,
  CreateResult,
  SetOptions,
  GetOptions,
  DeleteOptions,
  ListOptions,
  SearchOptions,
  HealthResult,
  SetResult,
  GetResult,
  DeleteResult,
  ListIdsResult,
  ListItemsResult,
  BulkGetResult,
  BulkCreateItem,
  BulkCreateResult,
  BulkSetItem,
  BulkSetResult,
  BulkDeleteResult,
} from "./types.ts";

// ── Internal helpers ───────────────────────────────────────────────────────

/**
 * Converts the SDK's ergonomic filter object format to the API wire format.
 *
 * SDK input:  `{ price: { gte: 10, lte: 100 }, category: { eq: "books" } }`
 * API output: `[{ field: "price", op: "gte", value: 10 }, ...]`
 */
function filtersToArray(filters: Filters): { field: string; op: string; value: unknown }[] {
  const result: { field: string; op: string; value: unknown }[] = [];
  for (const [field, operators] of Object.entries(filters)) {
    if (!operators) continue;
    for (const [op, value] of Object.entries(operators as Record<string, unknown>)) {
      if (value !== undefined) result.push({ field, op, value });
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
//  FlexDBClient
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The primary FlexDB client for API v2. Create a single instance at module scope
 * and reuse it across your application.
 *
 * Use {@link createClient} rather than instantiating this class directly.
 *
 * ### Namespace binding
 *
 * ```ts
 * const users = db.namespace("users");
 * await users.set("user:42", { name: "Alice" });
 * const { data } = await users.get<User>("user:42");
 * ```
 */
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

  #request<T>(opts: RequestOptions, opOptions?: OperationOptions): Promise<T> {
    const finalOptions: RequestOptions = { ...opts };
    if (opOptions?.signal) finalOptions.signal = opOptions.signal;
    return request<T>(this.#baseUrl, this.#authHeader, finalOptions, this.#retry);
  }

  // ── Health ────────────────────────────────────────────────────────────────

  /**
   * Pings the FlexDB service. No authentication required.
   *
   * @example
   * ```ts
   * const { status } = await db.health();
   * console.log(status); // "ok"
   * ```
   */
  async health(): Promise<HealthResult> {
    const raw = await this.#request<{ v: string; ok: boolean; data: { status: string; version: string } }>(
      { method: "GET", path: "/" },
    );
    return { v: raw.v, ok: true, status: raw.data.status, version: raw.data.version };
  }

  // ── Create ────────────────────────────────────────────────────────────────

  /**
   * Creates an object with a server-generated nanoid key.
   *
   * The key is returned in the response and is always a valid nanoid(21).
   * The object is immediately readable via {@link get} but will not appear
   * in {@link list} or {@link search} for up to ~60 seconds (write-buffer lag).
   *
   * @example
   * ```ts
   * const { key } = await db.create({ name: "Alice", score: 9001 }, {
   *   namespace: "users",
   *   sp: { score: 9001, role: "admin" },
   * });
   * ```
   */
  async create<T, SP extends SearchParams = SearchParams>(
    value: T,
    options?: CreateOptions<SP>,
  ): Promise<CreateResult> {
    const ns = this.#ns(options);
    const body: Record<string, unknown> = { data: value };
    if (options?.sp !== undefined) body.sp = options.sp;

    const raw = await this.#request<{ v: string; ok: boolean; data: { id: string } }>(
      { method: "POST", path: `/v2/o/${encodeURIComponent(ns)}`, body },
      options,
    );
    return { key: raw.data.id };
  }

  // ── Get ───────────────────────────────────────────────────────────────────

  /**
   * Retrieves a single object by namespace and key.
   *
   * @throws {@link FlexDBError} with `code === "ERR_NOT_FOUND"` if the key does not exist.
   *
   * @example
   * ```ts
   * const { data } = await db.get<User>("user:42", { namespace: "users" });
   * console.log(data.name); // "Alice"
   * ```
   */
  async get<T = unknown>(
    key: string,
    options?: GetOptions,
  ): Promise<GetResult<T>> {
    const ns = this.#ns(options);
    const raw = await this.#request<{ v: string; ok: boolean; data: { data: T } }>(
      { method: "GET", path: `/v2/o/${encodeURIComponent(ns)}/${encodeURIComponent(key)}` },
      options,
    );
    return { data: raw.data.data };
  }

  // ── Set ───────────────────────────────────────────────────────────────────

  /**
   * Creates or replaces an object at a caller-supplied key.
   *
   * Returns `201 Created` for new keys, `200 OK` for existing keys —
   * both are treated as success by the transport.
   *
   * @example
   * ```ts
   * await db.set("user:42", { name: "Alice", score: 9001 }, {
   *   namespace: "users",
   *   sp: { score: 9001, role: "admin" },
   * });
   * ```
   */
  async set<T, SP extends SearchParams = SearchParams>(
    key: string,
    value: T,
    options?: SetOptions<SP>,
  ): Promise<SetResult> {
    const ns = this.#ns(options);
    const body: Record<string, unknown> = { data: value };
    if (options?.sp !== undefined) body.sp = options.sp;

    await this.#request<{ v: string; ok: boolean; data: Record<string, never> }>(
      { method: "PUT", path: `/v2/o/${encodeURIComponent(ns)}/${encodeURIComponent(key)}`, body },
      options,
    );
    return { key };
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  /**
   * Removes an object from all storage tiers. Idempotent — deleting a
   * non-existent key returns success.
   *
   * The server returns `204 No Content`.
   *
   * @example
   * ```ts
   * await db.delete("user:42", { namespace: "users" });
   * ```
   */
  async delete(key: string, options?: DeleteOptions): Promise<DeleteResult> {
    const ns = this.#ns(options);
    await this.#request<undefined>(
      { method: "DELETE", path: `/v2/o/${encodeURIComponent(ns)}/${encodeURIComponent(key)}` },
      options,
    );
    return {};
  }

  // ── List ──────────────────────────────────────────────────────────────────

  /**
   * Lists all keys in a namespace, returning only key strings.
   *
   * @example
   * ```ts
   * const { keys, cursor } = await db.list({ namespace: "users", limit: 50 });
   * ```
   */
  async list(options?: ListOptions & { hydrate?: false }): Promise<ListIdsResult>;

  /**
   * Lists all objects in a namespace, returning full objects.
   *
   * @example
   * ```ts
   * const { items } = await db.list<User>({ namespace: "users", hydrate: true, limit: 50 });
   * for (const { key, data } of items) console.log(key, data.name);
   * ```
   */
  async list<T = unknown>(
    options: ListOptions & { hydrate: true },
  ): Promise<ListItemsResult<T>>;

  async list<T = unknown>(
    options?: ListOptions,
  ): Promise<ListIdsResult | ListItemsResult<T>> {
    const ns = this.#ns(options);
    const query: Record<string, string | number | boolean | undefined> = {
      limit: options?.limit !== undefined ? clampLimit(options.limit) : undefined,
      cursor: options?.cursor,
    };
    if (options?.hydrate) query.hydrate = "true";

    if (options?.hydrate) {
      const raw = await this.#request<{
        v: string; ok: boolean;
        data: {
          items: { key: string; data: T }[];
          cursor: string | null;
        };
      }>(
        { method: "GET", path: `/v2/list/${encodeURIComponent(ns)}`, query },
        options,
      );
      return {
        items: raw.data.items.map((item) => ({ key: item.key, data: item.data })),
        cursor: raw.data.cursor,
      };
    }

    const raw = await this.#request<{
      v: string; ok: boolean;
      data: { keys: string[]; cursor: string | null };
    }>(
      { method: "GET", path: `/v2/list/${encodeURIComponent(ns)}`, query },
      options,
    );
    return { keys: raw.data.keys, cursor: raw.data.cursor };
  }

  // ── Search ────────────────────────────────────────────────────────────────

  /**
   * Searches objects by their indexed `sp` fields, returning only keys.
   *
   * @example
   * ```ts
   * const { keys } = await db.search({
   *   namespace: "users",
   *   filters: { score: { gte: 1000 }, role: { eq: "admin" } },
   * });
   * ```
   */
  async search<SP extends SearchParams = SearchParams>(
    options: SearchOptions<SP> & { hydrate?: false },
  ): Promise<ListIdsResult>;

  /**
   * Searches objects by their indexed `sp` fields, returning full objects.
   *
   * @example
   * ```ts
   * const { items } = await db.search<User, UserSP>({
   *   namespace: "users",
   *   filters: { score: { gte: 1000 } },
   *   hydrate: true,
   * });
   * ```
   */
  async search<T = unknown, SP extends SearchParams = SearchParams>(
    options: SearchOptions<SP> & { hydrate: true },
  ): Promise<ListItemsResult<T>>;

  async search<T = unknown, SP extends SearchParams = SearchParams>(
    options: SearchOptions<SP>,
  ): Promise<ListIdsResult | ListItemsResult<T>> {
    const ns = this.#ns(options);
    const body: Record<string, unknown> = {
      filters: filtersToArray(options.filters),
    };
    if (options.limit !== undefined) body.limit = clampLimit(options.limit);
    if (options.cursor !== undefined) body.cursor = options.cursor;
    if (options.hydrate) body.hydrate = true;

    if (options.hydrate) {
      const raw = await this.#request<{
        v: string; ok: boolean;
        data: {
          items: { key: string; data: T }[];
          cursor: string | null;
        };
      }>(
        { method: "POST", path: `/v2/search/${encodeURIComponent(ns)}`, body },
        options,
      );
      return {
        items: raw.data.items.map((item) => ({ key: item.key, data: item.data })),
        cursor: raw.data.cursor,
      };
    }

    const raw = await this.#request<{
      v: string; ok: boolean;
      data: { keys: string[]; cursor: string | null };
    }>(
      { method: "POST", path: `/v2/search/${encodeURIComponent(ns)}`, body },
      options,
    );
    return { keys: raw.data.keys, cursor: raw.data.cursor };
  }

  // ── Bulk Get ──────────────────────────────────────────────────────────────

  /**
   * Retrieves multiple objects in a single request. Missing keys are included
   * with `data: null`. Response order matches the input key order.
   *
   * @example
   * ```ts
   * const { items } = await db.bulkGet<User>(["user:1", "user:2"], { namespace: "users" });
   * for (const item of items) {
   *   if (item.ok) console.log(item.key, item.data!.name);
   * }
   * ```
   */
  async bulkGet<T = unknown>(
    keys: string[],
    options?: OperationOptions,
  ): Promise<BulkGetResult<T>> {
    const ns = this.#ns(options);
    const raw = await this.#request<{
      v: string; ok: boolean;
      data: { items: { key: string; ok: boolean; data?: T }[] };
    }>(
      { method: "POST", path: "/v2/bulk/get", body: { ns, keys } },
      options,
    );
    return { items: raw.data.items };
  }

  // ── Bulk Create ───────────────────────────────────────────────────────────

  /**
   * Creates multiple objects with server-generated keys.
   * Response items are in the same order as the input items.
   *
   * @example
   * ```ts
   * const { items } = await db.bulkCreate(
   *   [
   *     { data: { name: "Alice" }, sp: { role: "admin" } },
   *     { data: { name: "Bob" } },
   *   ],
   *   { namespace: "users" },
   * );
   * for (const r of items) {
   *   if (r.ok) console.log(r.id);
   * }
   * ```
   */
  async bulkCreate<T, SP extends SearchParams = SearchParams>(
    items: BulkCreateItem<T, SP>[],
    options?: OperationOptions,
  ): Promise<BulkCreateResult> {
    const ns = this.#ns(options);
    const raw = await this.#request<{
      v: string; ok: boolean;
      data: { items: { ok: boolean; id?: string; error?: string }[] };
    }>(
      {
        method: "POST",
        path: "/v2/bulk/create",
        body: {
          ns,
          items: items.map((item) => {
            const entry: Record<string, unknown> = { data: item.data };
            if (item.sp !== undefined) entry.sp = item.sp;
            return entry;
          }),
        },
      },
      options,
    );
    return { items: raw.data.items };
  }

  // ── Bulk Set ──────────────────────────────────────────────────────────────

  /**
   * Creates or replaces multiple objects in a single request.
   * Each item is processed independently.
   *
   * @example
   * ```ts
   * const { items } = await db.bulkSet(
   *   [
   *     { key: "user:1", data: { name: "Alice" }, sp: { score: 42 } },
   *     { key: "user:2", data: { name: "Bob" } },
   *   ],
   *   { namespace: "users" },
   * );
   * ```
   */
  async bulkSet<T, SP extends SearchParams = SearchParams>(
    items: BulkSetItem<T, SP>[],
    options?: OperationOptions,
  ): Promise<BulkSetResult> {
    const ns = this.#ns(options);
    const raw = await this.#request<{
      v: string; ok: boolean;
      data: { items: { ok: boolean; error?: string }[] };
    }>(
      {
        method: "POST",
        path: "/v2/bulk/set",
        body: {
          ns,
          items: items.map((item) => {
            const entry: Record<string, unknown> = { key: item.key, data: item.data };
            if (item.sp !== undefined) entry.sp = item.sp;
            return entry;
          }),
        },
      },
      options,
    );
    return { items: raw.data.items };
  }

  // ── Bulk Delete ───────────────────────────────────────────────────────────

  /**
   * Removes multiple objects in a single request. Non-existent keys are
   * silently ignored.
   *
   * @example
   * ```ts
   * await db.bulkDelete(["user:1", "user:2"], { namespace: "users" });
   * ```
   */
  async bulkDelete(
    keys: string[],
    options?: OperationOptions,
  ): Promise<BulkDeleteResult> {
    const ns = this.#ns(options);
    await this.#request<{ v: string; ok: boolean; data: Record<string, never> }>(
      { method: "POST", path: "/v2/bulk/delete", body: { ns, keys } },
      options,
    );
    return {};
  }

  // ── Namespace binding ─────────────────────────────────────────────────────

  /**
   * Returns a {@link NamespacedClient} with `ns` pre-bound to every operation.
   *
   * ```ts
   * const users = db.namespace("users");
   * await users.set("user:42", { name: "Alice" });
   * ```
   */
  namespace<DefaultSP extends SearchParams = SearchParams>(ns: string): NamespacedClient<DefaultSP> {
    return new NamespacedClient<DefaultSP>(this, ns);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  NamespacedClient
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A thin wrapper around {@link FlexDBClient} that automatically injects a
 * fixed namespace into every operation.
 *
 * Obtain an instance via {@link FlexDBClient.namespace}:
 * ```ts
 * const users = db.namespace("users");
 * await users.set("user:42", { name: "Alice" });
 * const { data } = await users.get<User>("user:42");
 * ```
 */
export class NamespacedClient<DefaultSP extends SearchParams = SearchParams> {
  readonly #client: FlexDBClient;
  readonly #namespace: string;

  /** @internal Use {@link FlexDBClient.namespace} instead. */
  constructor(client: FlexDBClient, namespace: string) {
    this.#client    = client;
    this.#namespace = namespace;
  }

  get<T = unknown>(
    key: string,
    options?: Omit<GetOptions, "namespace">,
  ): Promise<GetResult<T>> {
    return this.#client.get<T>(key, { ...options, namespace: this.#namespace });
  }

  create<T, SP extends SearchParams = DefaultSP>(
    value: T,
    options?: Omit<CreateOptions<SP>, "namespace">,
  ): Promise<CreateResult> {
    return this.#client.create<T, SP>(value, { ...options, namespace: this.#namespace });
  }

  set<T, SP extends SearchParams = DefaultSP>(
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
  list<T = unknown>(
    options: Omit<ListOptions, "namespace"> & { hydrate: true },
  ): Promise<ListItemsResult<T>>;
  list<T = unknown>(
    options?: Omit<ListOptions, "namespace">,
  ): Promise<ListIdsResult | ListItemsResult<T>> {
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

  bulkGet<T = unknown>(
    keys: string[],
    options?: Omit<OperationOptions, "namespace">,
  ): Promise<BulkGetResult<T>> {
    return this.#client.bulkGet<T>(keys, { ...options, namespace: this.#namespace });
  }

  bulkCreate<T, SP extends SearchParams = DefaultSP>(
    items: BulkCreateItem<T, SP>[],
    options?: Omit<OperationOptions, "namespace">,
  ): Promise<BulkCreateResult> {
    return this.#client.bulkCreate<T, SP>(items, { ...options, namespace: this.#namespace });
  }

  bulkSet<T, SP extends SearchParams = DefaultSP>(
    items: BulkSetItem<T, SP>[],
    options?: Omit<OperationOptions, "namespace">,
  ): Promise<BulkSetResult> {
    return this.#client.bulkSet<T, SP>(items, { ...options, namespace: this.#namespace });
  }

  bulkDelete(
    keys: string[],
    options?: Omit<OperationOptions, "namespace">,
  ): Promise<BulkDeleteResult> {
    return this.#client.bulkDelete(keys, { ...options, namespace: this.#namespace });
  }
}
