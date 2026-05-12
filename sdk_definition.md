# FlexDB JS/TS SDK — Definition

**Version:** 2.3.0  
**Audience:** Application developers integrating the FlexDB SDK  
**Purpose:** Complete reference for all exports, configuration options, methods, types, behavioral contracts, and edge cases. Use this document as the source of truth when building web documentation.
**Note:** The package contains an sdk_definition.md file for local documentation or as context for AI Agents 

---

## Table of Contents

1. [Installation](#1-installation)
2. [Quick Start](#2-quick-start)
3. [Client Configuration](#3-client-configuration)
4. [Retry Behavior](#4-retry-behavior)
5. [Namespace Binding](#5-namespace-binding)
6. [Operations](#6-operations)
   - [health()](#health)
   - [create()](#create)
   - [get()](#get)
   - [set()](#set)
   - [delete()](#delete)
   - [list()](#list)
   - [search()](#search)
   - [updateOne()](#updateone)
   - [update()](#update)
   - [bulkCreate()](#bulkcreate)
   - [bulkSet()](#bulkset)
   - [bulkDelete()](#bulkdelete)
7. [Filter Operators](#7-filter-operators)
8. [Partial Update Merge Semantics](#8-partial-update-merge-semantics)
9. [Pagination](#9-pagination)
10. [TypeScript Generics](#10-typescript-generics)
11. [Error Handling](#11-error-handling)
12. [Limit Clamping & Edge Cases](#12-limit-clamping--edge-cases)
13. [Request Cancellation](#13-request-cancellation)
14. [Runtime Compatibility](#14-runtime-compatibility)

---

## 1. Installation

### JSR (recommended)

```jsonc
// deno.json
{
  "imports": {
    "@arctics/flex-db-sdk": "jsr:@arctics/flex-db-sdk@^2.3.0"
  }
}
```

```jsonc
// package.json (Node.js / Bun)
{
  "dependencies": {
    "@arctics/flex-db-sdk": "jsr:@arctics/flex-db-sdk@^2.3.0"
  }
}
```

### Named exports

Everything you need is exported from the root module:

```ts
import {
  // Factory (recommended entry-point)
  createClient,

  // Classes (direct instantiation)
  FlexDBClient,
  NamespacedClient,

  // Pagination
  Paginator,
  paginateList,
  paginateListHydrated,
  paginateSearch,
  paginateSearchHydrated,

  // Errors
  FlexDBError,
  FlexDBNetworkError,
} from "@arctics/flex-db-sdk";

import type {
  // Config
  FlexDBClientOptions,
  RetryConfig,

  // Operation options
  OperationOptions,
  SetOptions,
  GetOptions,
  DeleteOptions,
  ListOptions,
  SearchOptions,
  UpdateOptions,

  // Filter types
  SearchParams,
  Filters,
  FilterOperators,

  // Bulk item shapes
  BulkCreateItem,
  BulkSetItem,

  // Metadata
  ObjectMeta,

  // Result types
  HealthResult,
  CreateResult,
  SetResult,
  GetResult,
  DeleteResult,
  ListIdsResult,
  ListItemsResult,
  ListResult,
  UpdateOneResult,
  UpdateResult,
  BulkCreateResult,
  BulkSetResult,
  BulkDeleteResult,

  // Pagination
  Page,
} from "@arctics/flex-db-sdk";
```

---

## 2. Quick Start

```ts
import { createClient } from "@arctics/flex-db-sdk";

const db = createClient({
  apiKey:    Deno.env.get("FLEXDB_API_KEY")!,
  baseUrl:   "https://eu.flex.arctics.dev",
  namespace: "users",
});

// Create — server generates a NanoID key
const { key } = await db.create({ name: "Alice", age: 30 });

// Read
const { data, metadata } = await db.get<{ name: string; age: number }>(key);
console.log(data.name);    // "Alice"
console.log(metadata.w);   // true = warm tier (DynamoDB)

// Full replace
await db.set(key, { name: "Alice", age: 31 });

// Partial patch — only updates age, name is preserved
await db.updateOne(key, { data: { age: 32 } });

// Delete
await db.delete(key);
```

---

## 3. Client Configuration

Use `createClient(options)` to create a `FlexDBClient`. This is the recommended entry-point — it validates required fields and applies defaults before constructing the client.

```ts
import { createClient } from "@arctics/flex-db-sdk";

const db = createClient({
  apiKey:    Deno.env.get("FLEXDB_API_KEY")!,
  baseUrl:   "https://eu.flex.arctics.dev",
  namespace: "users",
  retry:     { times: 5, delay: 50 },
});
```

### `FlexDBClientOptions`

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `apiKey` | `string` | Yes | — | Your JWT API key. Sent as `Authorization: Bearer <apiKey>` on every request. Never commit to source control — use environment variables. |
| `baseUrl` | `string` | Yes | — | Base URL of your FlexDB instance. Trailing slashes are stripped automatically. Example: `"https://eu.flex.arctics.dev"`. |
| `namespace` | `string` | No | — | Default namespace (collection) applied to every operation. Can be overridden per-call via the `namespace` field in any operation options object, or via `db.namespace()`. |
| `retry` | `RetryConfig \| false` | No | `{ times: 3, delay: 10 }` | Retry behaviour for transient failures. Pass `false` to disable retries entirely. See [Section 4](#4-retry-behavior). |

**Validation:** The constructor throws a synchronous `Error` if `apiKey` or `baseUrl` is missing or empty.

---

## 4. Retry Behavior

The SDK automatically retries transient failures. Retry logic is configured via `RetryConfig` when calling `createClient`.

### `RetryConfig`

| Field | Type | Default | Description |
|---|---|---|---|
| `times` | `number` | `3` | Maximum retry attempts **after** the first failure. Range: `0–10`. Values outside this range are clamped automatically. `0` means no retries (one total attempt). |
| `delay` | `number` | `10` | Fixed delay in milliseconds between each retry attempt. |

**Default behavior:** Up to 4 total attempts (1 initial + 3 retries), 10 ms apart.

### What is retried

| Scenario | Retried |
|---|---|
| Network failure (DNS, connection refused, timeout) | ✅ |
| HTTP 429 — per-second rate limit | ✅ |
| HTTP 429 — monthly rate limit | ✅ |
| HTTP 5xx — server error | ✅ |
| HTTP 4xx — client error (except 429) | ❌ |
| `AbortSignal` fired | ❌ |

Client errors (4xx) are thrown immediately — retrying them would not change the outcome. Aborted requests are rethrown as-is without retrying.

### Examples

```ts
// Disable retries entirely
const db = createClient({ apiKey: "...", baseUrl: "...", retry: false });

// Aggressive retry
const db = createClient({ apiKey: "...", baseUrl: "...", retry: { times: 5, delay: 100 } });

// Single attempt, no delay
const db = createClient({ apiKey: "...", baseUrl: "...", retry: { times: 0, delay: 0 } });
```

---

## 5. Namespace Binding

Namespaces are collections that scope all keys. The same key in two different namespaces refers to two different objects.

### Setting the default namespace

```ts
const db = createClient({ ..., namespace: "users" });
```

### Per-call override

```ts
await db.create({ name: "Carol" }, { namespace: "admins" });
```

### Namespace resolution order

1. `namespace` field in per-call options
2. Default `namespace` from `FlexDBClientOptions`
3. If neither is set → throws `Error` synchronously before making any network request

### `db.namespace(ns)` — binding a namespace

`FlexDBClient.namespace(ns)` returns a `NamespacedClient` with the given namespace pre-injected into every operation.

```ts
const users    = db.namespace("users");
const products = db.namespace("products");

const { key }  = await users.create({ name: "Alice" });
const { data } = await users.get<User>(key);
```

Supply a metadata type as the generic parameter to enable compile-time type checking of `metadata` on writes and `filters` on searches:

```ts
interface ProductSP {
  price:    number;
  category: string;
  inStock:  boolean;
}

const products = db.namespace<ProductSP>("products");

const { keys } = await products.search({
  filters: {
    price:   { lte: 100 },
    inStock: { eq: true },
  },
});
```

### `NamespacedClient`

`NamespacedClient<DefaultSP>` is a thin proxy over `FlexDBClient`. It exposes all the same methods (`create`, `get`, `set`, `delete`, `list`, `search`, `updateOne`, `update`, `bulkCreate`, `bulkSet`, `bulkDelete`) with the `namespace` option removed from each signature — the bound namespace is always used.

---

## 6. Operations

All operations are `async` and return `Promise`. Every response includes `v: 1` and `ok: true` on success. On failure, a `FlexDBError` or `FlexDBNetworkError` is thrown — never a non-throwing error response. See [Section 11](#11-error-handling).

---

### health()

Pings the service to verify it is reachable and healthy. No authentication required.

**Signature**

```ts
health(): Promise<HealthResult>
```

**Response — `HealthResult`**

| Field | Type | Description |
|---|---|---|
| `v` | `1` | Envelope version. |
| `ok` | `true` | Indicates success. |
| `status` | `string` | `"healthy"` when the service is healthy. |

**Notes**

- Does not require `Authorization` or `X-Namespace` headers.
- Useful for liveness probes and CI smoke tests.

**Example**

```ts
const { status } = await db.health();
console.log(status); // "healthy"
```

---

### create()

Creates a new object and stores it under a server-generated NanoID key.

**Signature**

```ts
create<T, SP extends SearchParams = SearchParams>(
  value:    T,
  options?: SetOptions<SP>,
): Promise<CreateResult>
```

**Parameters**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `value` | `T` | Yes | Any JSON-serialisable value: object, array, string, number, boolean, null. |
| `options.namespace` | `string` | Conditional | Required if no default namespace is set on the client. |
| `options.metadata` | `SP` | No | Key-value pairs indexed for future `search()` queries. Pass `undefined` to store no metadata. |
| `options.signal` | `AbortSignal` | No | Cancellation signal. See [Section 13](#13-request-cancellation). |

**Response — `CreateResult`**

| Field | Type | Description |
|---|---|---|
| `v` | `1` | Envelope version. |
| `ok` | `true` | Indicates success. |
| `key` | `string` | Server-generated NanoID (21 URL-safe characters). Store this — it is the only way to access the object. |

**Errors**

| Code | Condition |
|---|---|
| `ERR_MISSING_AUTH` | `apiKey` is missing or malformed |
| `ERR_MISSING_NAMESPACE` | No namespace provided |
| `ERR_UNAUTHORIZED` | Invalid or expired API key |
| `ERR_PERMISSION_DENIED` | Token lacks Create permission |
| `ERR_REQUEST_TOO_LARGE` | Payload exceeds 5 MB |
| `ERR_RATE_LIMIT_SECOND` | Per-second rate limit exceeded |
| `ERR_RATE_LIMIT_MONTH` | Monthly request limit exhausted |
| `ERR_STORE_FAILED` | Storage write failed |

**Notes**

- `metadata` is sent only when `options.metadata !== undefined`. Pass `metadata: {}` to store an empty metadata record explicitly.
- For caller-supplied keys, use `set()` instead.

**Examples**

```ts
// Basic create — no metadata
const { key } = await db.create(
  { name: "Alice", age: 30 },
  { namespace: "users" },
);

// Create with indexed metadata
const { key } = await db.create(
  { title: "Widget Pro", price: 49.99 },
  {
    namespace: "products",
    metadata:  { price: 49.99, category: "electronics", inStock: true },
  },
);

// Any JSON value type is valid
await db.create("a plain string", { namespace: "notes" });
await db.create(42,               { namespace: "scores" });
await db.create([1, 2, 3],        { namespace: "lists" });
```

---

### get()

Retrieves a single object and its full metadata by key.

**Signature**

```ts
get<T = unknown, SP extends SearchParams = SearchParams>(
  key:      string,
  options?: GetOptions,
): Promise<GetResult<T, SP>>
```

**Parameters**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `key` | `string` | Yes | The NanoID from `create()` or the key you passed to `set()`. URL-encoded automatically. |
| `options.namespace` | `string` | Conditional | Required if no default namespace is set on the client. |
| `options.signal` | `AbortSignal` | No | Cancellation signal. |

**Response — `GetResult<T, SP>`**

| Field | Type | Description |
|---|---|---|
| `v` | `1` | Envelope version. |
| `ok` | `true` | Indicates success. |
| `key` | `string` | Echoes the key used to fetch this object. |
| `data` | `T` | The stored value, deserialised. |
| `metadata` | `ObjectMeta<SP>` | Full metadata record for this object. |

**`ObjectMeta<SP>`**

| Field | Type | Description |
|---|---|---|
| `w` | `boolean` | `true` = warm tier (DynamoDB); `false` = cold tier (S3). |
| `s` | `number` | Serialised byte size of `data` at last write. |
| `lut` | `number` | Last-updated Unix timestamp (seconds). |
| `upi` | `number` | Reserved; always `0`. |
| `sp` | `SP` | Search parameters stored with this object. |

**Errors**

| Code | Condition |
|---|---|
| `ERR_NOT_FOUND` | No object with this key exists in this namespace |
| `ERR_MISSING_AUTH` | `apiKey` is missing or malformed |
| `ERR_UNAUTHORIZED` | Invalid or expired API key |
| `ERR_PERMISSION_DENIED` | Token lacks Read permission |

**Examples**

```ts
// Typed get
interface User { name: string; age: number; }
const { key, data, metadata } = await db.get<User>("abc123", { namespace: "users" });
console.log(data.name);          // TypeScript knows this is a string
console.log(metadata.w);         // true = warm tier
console.log(metadata.lut);       // Unix timestamp of last write
console.log(metadata.s, "bytes");// stored size

// Access indexed search params
interface UserSP { age: number; role: string; }
const { metadata: meta } = await db.get<User, UserSP>("abc123", { namespace: "users" });
console.log(meta.sp.role); // typed as string

// With cancellation
const controller = new AbortController();
setTimeout(() => controller.abort(), 3_000);
const { data } = await db.get<User>("abc123", {
  namespace: "users",
  signal:    controller.signal,
});
```

---

### set()

Upserts an object at a **caller-supplied** key. Creates the object if the key does not exist; fully replaces it if it does. This is a **full replace** — every call overwrites the entire stored value and metadata.

**Signature**

```ts
set<T, SP extends SearchParams = SearchParams>(
  key:      string,
  value:    T,
  options?: SetOptions<SP>,
): Promise<SetResult>
```

**Parameters**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `key` | `string` | Yes | Any non-empty string. URL-encoded automatically. |
| `value` | `T` | Yes | Any JSON-serialisable value. Fully replaces the previously stored value on update. |
| `options.namespace` | `string` | Conditional | Required if no default namespace is set on the client. |
| `options.metadata` | `SP` | No | Fully replaces the previously stored metadata. Pass `metadata: {}` to clear all metadata. |
| `options.signal` | `AbortSignal` | No | Cancellation signal. |

**Response — `SetResult`**

| Field | Type | Description |
|---|---|---|
| `v` | `1` | Envelope version. |
| `ok` | `true` | Indicates success. |
| `key` | `string` | Echoes the caller-supplied key. |

**Errors**

| Code | Condition |
|---|---|
| `ERR_MISSING_AUTH` | `apiKey` is missing or malformed |
| `ERR_UNAUTHORIZED` | Invalid or expired API key |
| `ERR_PERMISSION_DENIED` | Token lacks Update permission |
| `ERR_REQUEST_TOO_LARGE` | Payload exceeds 5 MB |
| `ERR_RATE_LIMIT_SECOND` | Per-second rate limit exceeded |
| `ERR_RATE_LIMIT_MONTH` | Monthly request limit exhausted |
| `ERR_STORE_FAILED` | Storage write failed |

**Notes**

- For partial (field-level) updates, use `updateOne()` instead.
- Storage tier assignment is recalculated on every update based on the new payload size.

**Examples**

```ts
// Upsert by user ID
await db.set(
  "user-42",
  { name: "Bob", age: 25 },
  { namespace: "users", metadata: { age: 25, role: "viewer" } },
);

// Full replace — previous value is completely overwritten
await db.set("user-42", { name: "Bob", age: 26 }, { namespace: "users" });

// Clear all metadata
await db.set("user-42", { name: "Bob" }, { namespace: "users", metadata: {} });
```

---

### delete()

Permanently removes an object and all its data across all storage tiers.

**Signature**

```ts
delete(
  key:      string,
  options?: DeleteOptions,
): Promise<DeleteResult>
```

**Parameters**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `key` | `string` | Yes | The key of the object to delete. URL-encoded automatically. |
| `options.namespace` | `string` | Conditional | Required if no default namespace is set on the client. |
| `options.signal` | `AbortSignal` | No | Cancellation signal. |

**Response — `DeleteResult`**

| Field | Type | Description |
|---|---|---|
| `v` | `1` | Envelope version. |
| `ok` | `true` | Indicates success. |

**Errors**

| Code | Condition |
|---|---|
| `ERR_MISSING_AUTH` | `apiKey` is missing or malformed |
| `ERR_UNAUTHORIZED` | Invalid or expired API key |
| `ERR_PERMISSION_DENIED` | Token lacks Delete permission |

**Notes**

- This operation is **irreversible**. The object's data, metadata, and all cache entries are deleted across all storage tiers in parallel.
- Non-existent keys are silently ignored — the server always returns 200 regardless of whether the key existed.

**Example**

```ts
await db.delete("user-42", { namespace: "users" });
```

---

### list()

Returns a paginated list of objects in the namespace, either as keys only or as full objects (hydrated).

**Signatures**

```ts
// Non-hydrated — returns keys only
list(
  options?: ListOptions & { hydrate?: false },
): Promise<ListIdsResult>

// Hydrated — returns full objects (limit must be ≤ 50)
list<T = unknown>(
  options: ListOptions & { hydrate: true },
): Promise<ListItemsResult<T>>
```

**Parameters — `ListOptions`**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `namespace` | `string` | Client default | Namespace to list. |
| `limit` | `number` | `20` | Max results per page. Range: 1–100. See [Section 12](#12-limit-clamping--edge-cases). |
| `cursor` | `string` | absent | Pagination token from the previous response. Treat as opaque. |
| `hydrate` | `boolean` | `false` | When `true`, returns full object data alongside keys. Server only activates hydration when `limit` ≤ 50. |
| `signal` | `AbortSignal` | absent | Cancellation signal. |

**Non-hydrated response — `ListIdsResult`**

| Field | Type | Always present | Description |
|---|---|---|---|
| `v` | `1` | Yes | Envelope version. |
| `ok` | `true` | Yes | Indicates success. |
| `keys` | `string[]` | Yes | Array of object keys on this page. Empty array `[]` if no objects exist. |
| `cursor` | `string` | No | Next-page token. Absent on the last page. |

**Hydrated response — `ListItemsResult<T>`**

| Field | Type | Always present | Description |
|---|---|---|---|
| `v` | `1` | Yes | Envelope version. |
| `ok` | `true` | Yes | Indicates success. |
| `keys` | `{ key: string; data: T \| null }[]` | Yes | Key-data pairs. `data` is `null` if the object was deleted between index scan and fetch. |
| `cursor` | `string` | No | Next-page token. Absent on the last page. |

**Errors**

| Code | Condition |
|---|---|
| `ERR_MISSING_AUTH` | `apiKey` is missing or malformed |
| `ERR_UNAUTHORIZED` | Invalid or expired API key |
| `ERR_PERMISSION_DENIED` | Token lacks List permission |
| `ERR_RATE_LIMIT_SECOND` | Per-second rate limit exceeded |
| `ERR_RATE_LIMIT_MONTH` | Monthly request limit exhausted |

**Notes**

- Results are in lexicographic key order within the namespace.
- When `hydrate: true` and `limit` > 50, the SDK automatically caps the outgoing limit to 50. See [Section 12](#12-limit-clamping--edge-cases).
- For automatic pagination, use `paginateList()` or `paginateListHydrated()`. See [Section 9](#9-pagination).

**Examples**

```ts
// List keys — manual cursor pagination
let cursor: string | undefined;
do {
  const result = await db.list({ namespace: "users", limit: 50, cursor });
  console.log(result.keys);  // string[]
  cursor = result.cursor;
} while (cursor);

// List full objects
const { keys } = await db.list<User>({
  namespace: "users",
  hydrate:   true,
  limit:     50,
});
for (const { key, data } of keys) {
  console.log(key, data?.name);
}
```

---

### search()

Queries objects by their stored metadata fields using filter expressions. Returns either keys only or full objects.

**Signatures**

```ts
// Non-hydrated — returns keys only
search<SP extends SearchParams = SearchParams>(
  options: SearchOptions<SP> & { hydrate?: false },
): Promise<ListIdsResult>

// Hydrated — returns full objects (limit must be ≤ 50)
search<T = unknown, SP extends SearchParams = SearchParams>(
  options: SearchOptions<SP> & { hydrate: true },
): Promise<ListItemsResult<T>>
```

**Parameters — `SearchOptions<SP>`**

Extends `ListOptions` (all list parameters apply) with:

| Parameter | Type | Required | Description |
|---|---|---|---|
| `filters` | `Filters<SP>` | Yes | Filter expressions applied against stored `metadata`. All filters are AND-ed. See [Section 7](#7-filter-operators). |

**Response shapes**

Same as `list()` — `ListIdsResult` (non-hydrated) or `ListItemsResult<T>` (hydrated).

**Errors**

| Code | Condition |
|---|---|
| `ERR_MISSING_FILTER` | `filters` is missing or empty |
| `ERR_MISSING_AUTH` | `apiKey` is missing or malformed |
| `ERR_UNAUTHORIZED` | Invalid or expired API key |
| `ERR_PERMISSION_DENIED` | Token lacks Search permission |
| `ERR_RATE_LIMIT_SECOND` | Per-second rate limit exceeded |
| `ERR_RATE_LIMIT_MONTH` | Monthly request limit exhausted |

**Notes**

- `filters` is required and must be non-empty. An empty `filters: {}` object throws `FlexDBError` with `code === "ERR_MISSING_FILTER"`.
- All filters are AND-ed. There is no OR support.
- Do not mix cursors from `list()` with `search()` — this produces undefined behavior.

**Examples**

```ts
// Filter by price range and category
const { keys } = await db.search({
  namespace: "products",
  filters: {
    price:    { gte: 10, lte: 100 },
    category: { eq: "electronics" },
  },
});

// Typed search with metadata type
interface ProductSP { price: number; category: string; inStock: boolean; }
interface Product   { title: string; price: number; }

const { keys } = await db.search<Product, ProductSP>({
  namespace: "products",
  filters:   { inStock: { eq: true }, price: { lte: 50 } },
  hydrate:   true,
  limit:     10,
});

for (const { key, data } of keys) {
  console.log(key, data?.title, data?.price);
}
```

---

### updateOne()

Performs a **shallow merge** update on a single existing object. Unlike `set()` which fully replaces data, `updateOne()` merges only the fields you provide — unspecified fields are preserved.

The object must already exist. If the key is not found, `ERR_NOT_FOUND` is thrown.

See [Section 8](#8-partial-update-merge-semantics) for merge rules.

**Signature**

```ts
updateOne<T = unknown, SP extends SearchParams = SearchParams>(
  key:      string,
  patch:    { data?: T; metadata?: SP },
  options?: OperationOptions,
): Promise<UpdateOneResult>
```

**Parameters**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `key` | `string` | Yes | The object key to patch. URL-encoded automatically. |
| `patch.data` | `T` | No | Fields to merge into the existing `data`. If omitted, existing data is unchanged. |
| `patch.metadata` | `SP` | No | Fields to merge into the existing `metadata`. Keys in the patch overwrite or add; keys absent from the patch are preserved. |
| `options.namespace` | `string` | Conditional | Required if no default namespace is set. |
| `options.signal` | `AbortSignal` | No | Cancellation signal. |

**Response — `UpdateOneResult`**

| Field | Type | Description |
|---|---|---|
| `v` | `1` | Envelope version. |
| `ok` | `true` | Indicates success. |
| `key` | `string` | Echoes the patched key. |

**Errors**

| Code | Condition |
|---|---|
| `ERR_NOT_FOUND` | No object with this key exists in this namespace |
| `ERR_MISSING_AUTH` | `apiKey` is missing or malformed |
| `ERR_UNAUTHORIZED` | Invalid or expired API key |
| `ERR_PERMISSION_DENIED` | Token lacks Update permission |
| `ERR_REQUEST_TOO_LARGE` | Merged data exceeds 5 MB |
| `ERR_RATE_LIMIT_SECOND` | Per-second rate limit exceeded |
| `ERR_RATE_LIMIT_MONTH` | Monthly request limit exhausted |
| `ERR_STORE_FAILED` | Storage write failed |

**Examples**

```ts
// Patch a single field — name and city are preserved
await db.updateOne(
  "user-42",
  { data: { age: 31 } },
  { namespace: "users" },
);

// Patch metadata only
await db.updateOne(
  "user-42",
  { metadata: { role: "admin" } },
  { namespace: "users" },
);

// Patch both data and metadata
await db.updateOne(
  "product-7",
  {
    data:     { price: 39.99 },
    metadata: { price: 39.99, inStock: false },
  },
  { namespace: "products" },
);
```

---

### update()

Finds objects matching search filters and performs a **shallow merge** update on each one. Uses the same filter engine as `search()`. Supports cursor pagination — use `cursor` from the previous response to process subsequent pages.

See [Section 8](#8-partial-update-merge-semantics) for merge rules.

**Signature**

```ts
update<SP extends SearchParams = SearchParams>(
  options: UpdateOptions<SP>,
): Promise<UpdateResult>
```

**Parameters — `UpdateOptions<SP>`**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `filters` | `Filters<SP>` | Yes | Filter conditions — all AND-ed. Same syntax as `search()`. Must be non-empty. |
| `data` | `unknown` | No | Fields to merge into each matching object's `data`. Omit to leave data unchanged. |
| `metadata` | `SP` | No | Fields to merge into each matching object's `metadata`. Omit to leave metadata unchanged. |
| `limit` | `number` | `20` | Max objects to process per call. Values > 100 are clamped to 100. |
| `cursor` | `string` | absent | Pagination token from a previous response. |
| `namespace` | `string` | Conditional | Required if no default namespace is set. |
| `signal` | `AbortSignal` | No | Cancellation signal. |

**Response — `UpdateResult`**

| Field | Type | Always present | Description |
|---|---|---|---|
| `v` | `1` | Yes | Envelope version. |
| `ok` | `true` | Yes | Indicates success. |
| `updated` | `number` | Yes | Count of objects successfully patched in this call. |
| `cursor` | `string` | No | Present when more matching objects exist. Pass to the next call's `cursor`. |

Objects race-deleted during the operation are silently skipped and not counted in `updated`.

**Errors**

| Code | Condition |
|---|---|
| `ERR_MISSING_FILTER` | `filters` is missing or empty |
| `ERR_MISSING_AUTH` | `apiKey` is missing or malformed |
| `ERR_UNAUTHORIZED` | Invalid or expired API key |
| `ERR_PERMISSION_DENIED` | Token lacks Update permission |
| `ERR_RATE_LIMIT_SECOND` | Per-second rate limit exceeded |
| `ERR_RATE_LIMIT_MONTH` | Monthly request limit exhausted |

**Example**

```ts
// Archive all active orders — paginate until done
let cursor: string | undefined;
do {
  const result = await db.update({
    namespace: "orders",
    filters:   { status: { eq: "active" } },
    data:      { status: "archived" },
    metadata:  { status: "archived" },
    limit:     50,
    cursor,
  });
  console.log(`Patched ${result.updated} objects`);
  cursor = result.cursor;
} while (cursor);
```

---

### bulkCreate()

Creates up to 50 objects in parallel, each with a server-generated NanoID key.

All items are validated upfront (size checks) before any writes begin. If any `data` value exceeds 5 MB, the entire request is rejected and no objects are created.

**Required permission:** BulkCreate

**Signature**

```ts
bulkCreate<T, SP extends SearchParams = SearchParams>(
  items:    BulkCreateItem<T, SP>[],
  options?: OperationOptions,
): Promise<BulkCreateResult>
```

**`BulkCreateItem<T, SP>`**

| Field | Type | Required | Description |
|---|---|---|---|
| `data` | `T` | Yes | The value to store. |
| `metadata` | `SP` | No | Search parameters. Defaults to `{}` if omitted. |

**Response — `BulkCreateResult`**

| Field | Type | Description |
|---|---|---|
| `v` | `1` | Envelope version. |
| `ok` | `true` | Indicates success. |
| `keys` | `string[]` | Auto-generated keys for each created object, in the same order as `items`. |

**Errors**

| Code | Condition |
|---|---|
| `ERR_BULK_TOO_LARGE` | `items` array exceeds the server limit (default 50) |
| `ERR_REQUEST_TOO_LARGE` | One or more `data` values exceed 5 MB |
| `ERR_PERMISSION_DENIED` | Token lacks BulkCreate permission |
| `ERR_RATE_LIMIT_SECOND` | Per-second rate limit exceeded |
| `ERR_RATE_LIMIT_MONTH` | Monthly request limit exhausted |
| `ERR_STORE_FAILED` | Storage write failed |

**Example**

```ts
const { keys } = await db.bulkCreate(
  [
    { data: { name: "Alice" }, metadata: { age: 30, role: "admin" } },
    { data: { name: "Bob" },   metadata: { age: 25, role: "viewer" } },
    { data: { name: "Carol" } },
  ],
  { namespace: "users" },
);
console.log(keys); // ["<nanoid1>", "<nanoid2>", "<nanoid3>"]
```

---

### bulkSet()

Upserts up to 50 objects in parallel at caller-supplied keys. Each item is a full replace — semantics identical to calling `set()` on each item individually.

All items are validated upfront before any writes begin. If any `data` value exceeds 5 MB, the entire request is rejected.

**Required permission:** BulkUpdate

**Signature**

```ts
bulkSet<T, SP extends SearchParams = SearchParams>(
  items:    BulkSetItem<T, SP>[],
  options?: OperationOptions,
): Promise<BulkSetResult>
```

**`BulkSetItem<T, SP>`**

| Field | Type | Required | Description |
|---|---|---|---|
| `key` | `string` | Yes | The object key to create or fully overwrite. |
| `data` | `T` | Yes | Fully replaces the previously stored value. |
| `metadata` | `SP` | No | Fully replaces the previously stored metadata. Defaults to `{}`. |

**Response — `BulkSetResult`**

| Field | Type | Description |
|---|---|---|
| `v` | `1` | Envelope version. |
| `ok` | `true` | Indicates success. |
| `keys` | `string[]` | The input keys echoed back in the same order as `items`. |

**Errors**

| Code | Condition |
|---|---|
| `ERR_BULK_TOO_LARGE` | `items` array exceeds the server limit (default 50) |
| `ERR_REQUEST_TOO_LARGE` | One or more `data` values exceed 5 MB |
| `ERR_PERMISSION_DENIED` | Token lacks BulkUpdate permission |
| `ERR_RATE_LIMIT_SECOND` | Per-second rate limit exceeded |
| `ERR_RATE_LIMIT_MONTH` | Monthly request limit exhausted |
| `ERR_STORE_FAILED` | Storage write failed |

**Example**

```ts
const { keys } = await db.bulkSet(
  [
    { key: "user-1", data: { name: "Alice" }, metadata: { role: "admin" } },
    { key: "user-2", data: { name: "Bob" },   metadata: { role: "viewer" } },
  ],
  { namespace: "users" },
);
console.log(keys); // ["user-1", "user-2"]
```

---

### bulkDelete()

Deletes up to 50 objects in parallel from all storage tiers. Non-existent keys are silently skipped.

**Required permission:** BulkDelete

**Signature**

```ts
bulkDelete(
  keys:     string[],
  options?: OperationOptions,
): Promise<BulkDeleteResult>
```

**Response — `BulkDeleteResult`**

| Field | Type | Description |
|---|---|---|
| `v` | `1` | Envelope version. |
| `ok` | `true` | Indicates success. |

**Errors**

| Code | Condition |
|---|---|
| `ERR_BULK_TOO_LARGE` | `keys` array exceeds the server limit (default 50) |
| `ERR_PERMISSION_DENIED` | Token lacks BulkDelete permission |
| `ERR_RATE_LIMIT_SECOND` | Per-second rate limit exceeded |
| `ERR_RATE_LIMIT_MONTH` | Monthly request limit exhausted |

**Example**

```ts
await db.bulkDelete(
  ["user-1", "user-2", "user-3"],
  { namespace: "users" },
);
```

---

## 7. Filter Operators

Filters are applied server-side against the `metadata` stored with each object. All filter entries in a single request are AND-ed together — there is no OR support.

Each filter entry has the shape: `{ "<fieldName>": { "<operator>": <value> } }`

| Operator | Value type | Description |
|---|---|---|
| `eq` | any scalar | Exact equality: `field === value`. |
| `neq` | any scalar | Not equal: `field !== value`. |
| `gt` | number or string | Greater than: `field > value`. |
| `gte` | number or string | Greater than or equal: `field >= value`. |
| `lt` | number or string | Less than: `field < value`. |
| `lte` | number or string | Less than or equal: `field <= value`. |
| `sw` | string | Field starts with the given prefix. |
| `ex` | boolean | Attribute existence: `true` = field must exist. Note: passing `false` has no server-side effect. |

**Multiple operators on one field** (range query):

```ts
// Price between 10 and 100 (inclusive)
filters: { price: { gte: 10, lte: 100 } }
```

**Full example:**

```ts
await db.search({
  namespace: "products",
  filters: {
    price:    { gte: 10, lte: 100 },   // range
    category: { eq: "electronics" },   // exact match
    sku:      { sw: "WIDGET-" },        // starts with
    brand:    { neq: "generic" },       // not equal
    rating:   { gt: 4 },               // greater than
    discount: { ex: true },             // field exists
  },
});
```

**Type-safe filters with `Filters<SP>`:**

```ts
interface ProductSP {
  price:    number;
  category: string;
  inStock:  boolean;
}

const filters: Filters<ProductSP> = {
  price:    { gte: 10, lte: 100 },
  category: { eq: "electronics" },
  inStock:  { eq: true },
};
```

**Behavioral notes:**

- Objects stored without a `metadata` field will not match any filter.
- If an `op` value is unrecognized, that filter entry is silently skipped by the server.
- Filter values must match the stored type. Comparing a string field with a number produces no matches.
- Nested metadata fields are not supported. Filter field names must be top-level keys.

---

## 8. Partial Update Merge Semantics

`updateOne()` and `update()` both apply partial (merge) updates rather than full replacements.

### Data merge

| Existing `data` type | Patch type | Result |
|---|---|---|
| JSON Object | JSON Object | Keys from patch are inserted or overwritten. Keys absent from patch remain unchanged. |
| any | non-Object OR existing is non-Object | Existing value is replaced entirely by patch. |
| any | omitted (not in request) | Existing value is unchanged. |

**Example — object merge:**

Existing `data`: `{ "name": "Alice", "age": 30, "city": "Berlin" }`  
Patch `data`: `{ "age": 31, "country": "DE" }`  
Result: `{ "name": "Alice", "age": 31, "city": "Berlin", "country": "DE" }`

**Example — non-object replacement:**

Existing `data`: `[1, 2, 3]`  
Patch `data`: `[4, 5]`  
Result: `[4, 5]`

### Metadata merge

`metadata` is always shallow-merged regardless of value types:
- Keys from the patch overwrite or add to existing metadata.
- Keys absent from the patch remain unchanged.
- To remove a specific metadata key, set it to `null` in the patch.
- To clear all metadata, use `set()` with `metadata: {}`.

### Atomicity

Patch operations are not atomic — they perform a read then a write. Under concurrent writes to the same key, the last write wins. Serialize writes on the client side if atomicity is required.

---

## 9. Pagination

All `list()` and `search()` responses include a `cursor` field when more results exist. Pass this token back as `cursor` in the next call to get the following page.

### Manual pagination

```ts
let cursor: string | undefined;
do {
  const result = await db.list({ namespace: "users", limit: 50, cursor });
  process(result.keys);
  cursor = result.cursor;
} while (cursor);
```

### `Paginator<T>` — automatic pagination

The `Paginator<T>` class wraps the cursor loop and exposes an async-iterable interface.

#### Iteration

```ts
for await (const page of paginator) {
  console.log(page.data);    // T[] — items on this page
  console.log(page.cursor);  // string | undefined — next-page token
  console.log(page.hasMore); // boolean — false on the last page
}
```

#### `Page<T>`

| Field | Type | Description |
|---|---|---|
| `data` | `T[]` | Items on this page. |
| `cursor` | `string \| undefined` | Opaque token for the next page. `undefined` on the last page. |
| `hasMore` | `boolean` | `true` if more pages follow. |

#### `.all(): Promise<T[]>`

Collects every item across all pages into a single flat array.

> **Warning:** `.all()` loads every item into memory. Use with caution on large namespaces.

#### `.forEach(fn): Promise<void>`

Calls `fn` once for each item across all pages, in order. Awaits `fn` before fetching the next page.

### Factory functions

| Function | Item type (`T`) | Source |
|---|---|---|
| `paginateList(client, options?)` | `string` (key) | `list()` |
| `paginateListHydrated<T>(client, options?)` | `{ key: string; data: T \| null }` | `list({ hydrate: true })` |
| `paginateSearch<SP>(client, options)` | `string` (key) | `search()` |
| `paginateSearchHydrated<T, SP>(client, options)` | `{ key: string; data: T \| null }` | `search({ hydrate: true })` |

All factory functions accept both `FlexDBClient` and `NamespacedClient` as the first argument. `cursor` and `hydrate` are managed internally.

**Examples:**

```ts
import {
  paginateList,
  paginateListHydrated,
  paginateSearch,
  paginateSearchHydrated,
} from "@arctics/flex-db-sdk";

// Keys from list
for await (const page of paginateList(db, { namespace: "users", limit: 50 })) {
  console.log(page.data); // string[]
}

// Full objects from list
for await (const page of paginateListHydrated<User>(db, { namespace: "users", limit: 50 })) {
  for (const { key, data } of page.data) console.log(key, data?.name);
}

// Keys from search
for await (const page of paginateSearch(db, {
  namespace: "products",
  filters:   { category: { eq: "books" } },
  limit:     50,
})) {
  console.log(page.data); // string[]
}

// Full objects from search
for await (const page of paginateSearchHydrated<Product, ProductSP>(db, {
  namespace: "products",
  filters:   { price: { lte: 100 } },
  limit:     50,
})) {
  for (const { key, data } of page.data) console.log(key, data?.title);
}

// With a namespace-bound client
const users = db.namespace("users");
const allUsers = await paginateListHydrated<User>(users, { limit: 50 }).all();
```

**Cursor rules:**
- Do not mix cursors from `list()` with `search()` or `update()`. Results are undefined.
- Cursors are not stable across object deletions — deleted objects simply do not appear.
- Treat cursor values as opaque — do not parse, construct, or modify them.

---

## 10. TypeScript Generics

The SDK is fully generic with no `any` leakage in normal usage.

### Generic parameter summary

| Generic | Where used | Meaning |
|---|---|---|
| `T` | `get<T, SP>`, `list<T>`, `search<T, SP>`, `updateOne<T, SP>`, `paginateListHydrated<T>`, `paginateSearchHydrated<T, SP>` | Shape of the stored data value. |
| `SP extends SearchParams` | `create<T, SP>`, `set<T, SP>`, `get<T, SP>`, `search<T, SP>`, `updateOne<T, SP>`, `update<SP>`, `bulkCreate<T, SP>`, `bulkSet<T, SP>`, `SearchOptions<SP>`, `UpdateOptions<SP>`, `Filters<SP>`, `NamespacedClient<DefaultSP>` | Shape of the metadata fields — enables compile-time validation of filter keys and operator value types. Also types `metadata.sp` in `GetResult`. |
| `H extends boolean` | `ListResult<T, H>` | Conditional helper resolving to `ListItemsResult<T>` when `H = true` or `ListIdsResult` otherwise. |

### `SearchParams` type

```ts
type SearchParams = Record<
  string,
  string | number | boolean | null | (string | number | boolean | null)[]
>;
```

### End-to-end typed example

```ts
interface User {
  name:  string;
  email: string;
  age:   number;
}

interface UserSP {
  age:  number;
  role: "admin" | "viewer";
}

const users = db.namespace<UserSP>("users");

// create: metadata type-checked as UserSP
const { key } = await users.create(
  { name: "Alice", email: "alice@example.com", age: 30 },
  { metadata: { age: 30, role: "admin" } }, // ✅ validated
);

// get: data typed as User, metadata.sp typed as UserSP
const { data, metadata } = await users.get<User, UserSP>(key);
console.log(data.name);        // string ✅
console.log(metadata.sp.role); // "admin" | "viewer" ✅
console.log(metadata.w);       // boolean ✅

// updateOne: patch type-checked
await users.updateOne<User, UserSP>(key, {
  data:     { age: 31 },
  metadata: { age: 31 },
});

// search: filters type-checked against UserSP
const { keys } = await users.search({
  filters: {
    age:  { gte: 18 },        // number ✅
    role: { eq: "admin" },    // "admin" | "viewer" ✅
    // foo: { eq: "bar" },    // ❌ TypeScript error — "foo" not in UserSP
  },
});
```

---

## 11. Error Handling

Every operation throws on failure — there are no silent error returns. Two error classes cover all failure modes.

### `FlexDBError` — server returned a non-2xx response

```ts
import { FlexDBError } from "@arctics/flex-db-sdk";

try {
  await db.get("missing-key");
} catch (err) {
  if (err instanceof FlexDBError) {
    switch (err.code) {
      case "ERR_NOT_FOUND":
        console.error("Object does not exist");
        break;
      case "ERR_UNAUTHORIZED":
        console.error("Invalid or expired API key");
        break;
      case "ERR_PERMISSION_DENIED":
        console.error("Token lacks required permission");
        break;
      case "ERR_RATE_LIMIT_SECOND":
        console.error("Per-second rate limit hit — slow down");
        break;
      case "ERR_RATE_LIMIT_MONTH":
        console.error("Monthly limit exhausted — upgrade plan");
        break;
      default:
        console.error(`Server error ${err.status}: ${err.message}`);
    }
    if (err.hint) console.info("Hint:", err.hint);
  }
}
```

**`FlexDBError` properties**

| Property | Type | Description |
|---|---|---|
| `status` | `number` | HTTP status code (e.g. `404`, `401`, `429`, `500`). |
| `code` | `string \| undefined` | Stable machine-readable error constant. Branch on this. |
| `message` | `string` | Formatted: `[ERR_CODE] (status): human message\nHint: suggestion`. |
| `hint` | `string \| undefined` | Actionable suggestion from the server. |
| `body` | `unknown` | Raw response body for further inspection. |
| `name` | `"FlexDBError"` | Error class identifier. |

**Always branch on `code`, not `message`.**

### Error code reference

| Code | HTTP Status | When it occurs |
|---|---|---|
| `ERR_MISSING_AUTH` | 401 | `Authorization` header absent or not `Bearer <token>`. |
| `ERR_MISSING_NAMESPACE` | 400 | `X-Namespace` header absent. |
| `ERR_UNAUTHORIZED` | 401 | JWT invalid; wrong algorithm; wrong issuer; token expired; `jti` missing; token record not found. |
| `ERR_PERMISSION_DENIED` | 403 | Token lacks the required permission bit for this operation. |
| `ERR_FORBIDDEN` | 403 | Caller's IP is not in the database's whitelist. |
| `ERR_NOT_FOUND` | 404 | No object with this key exists (`get`, `updateOne`). |
| `ERR_MISSING_FILTER` | 400 | `search()` or `update()` called with empty or missing `filters`. |
| `ERR_RATE_LIMIT_SECOND` | 429 | Per-second request limit exceeded. Retried automatically. |
| `ERR_RATE_LIMIT_MONTH` | 429 | Monthly request limit exhausted. Retried automatically. |
| `ERR_REQUEST_TOO_LARGE` | 413 | Serialized payload exceeds the configured size limit (default 5 MB). |
| `ERR_BULK_TOO_LARGE` | 413 | Bulk `items` or `keys` array exceeds the server limit (default 50). |
| `ERR_STORE_FAILED` | 500 | Write failed — infrastructure error. |
| `ERR_INTERNAL` | 500 | Unexpected server error. |

### `FlexDBNetworkError` — `fetch` itself failed

Thrown when the HTTP request fails before a response is received.

```ts
import { FlexDBNetworkError } from "@arctics/flex-db-sdk";

try {
  await db.get("some-key");
} catch (err) {
  if (err instanceof FlexDBNetworkError) {
    console.error("Network error:", err.message);
    console.error("Original cause:", err.cause);
  }
}
```

**`FlexDBNetworkError` properties**

| Property | Type | Description |
|---|---|---|
| `message` | `string` | Human-readable description including attempt number. |
| `cause` | `unknown` | The original error thrown by `fetch`. |
| `name` | `"FlexDBNetworkError"` | Error class identifier. |

---

## 12. Limit Clamping & Edge Cases

### `limit` parameter clamping

| Input `limit` | Value sent to server |
|---|---|
| `undefined` | Not sent — server uses its default of `20` |
| `NaN` / non-integer | `20` |
| `< 1` (e.g. `0`, `-5`) | `1` |
| `> 100` (e.g. `500`) | `100` |
| `1–100` (valid integer) | As-is |

### Hydration limit cap

When `hydrate: true`, the server only activates full-object hydration when `limit ≤ 50`. The SDK prevents the type mismatch: when `hydrate: true`, the effective limit is capped to `Math.min(clampedLimit, 50)`.

| `hydrate` | `limit` input | Effective limit sent |
|---|---|---|
| `false` | `75` | `75` |
| `true` | `75` | `50` (capped) |
| `true` | `30` | `30` |
| `true` | `undefined` | Not sent (server default `20` ≤ 50 ✅) |

### Other edge cases

| Scenario | Behavior |
|---|---|
| `filters: {}` (empty object) on `search()` | Throws `FlexDBError` with `code === "ERR_MISSING_FILTER"`. |
| `metadata: {}` on `set()` | Clears all previously stored metadata for the object. |
| `data: null` in hydrated items | Object existed in the index at scan time but could not be retrieved (e.g. deleted mid-page). |
| Empty namespace (no objects) | `list()` returns `keys: []` — not an error. |
| Key with special characters | Keys are URL-encoded automatically before use in path parameters. |
| Cursor from `list` used in `search` or `update` | Undefined behavior — do not mix cursors across operation types. |
| Non-existent key in `delete()` | Always returns 200 — no existence check is performed. |
| Non-existent keys in `bulkDelete()` | Silently skipped. |

---

## 13. Request Cancellation

Any operation can be cancelled by passing an `AbortSignal` via `options.signal`.

```ts
const controller = new AbortController();
setTimeout(() => controller.abort(), 3_000);

try {
  const { data } = await db.get<User>("abc123", {
    namespace: "users",
    signal:    controller.signal,
  });
} catch (err) {
  if (err instanceof Error && err.name === "AbortError") {
    console.log("Request was cancelled");
  }
}
```

**Behavior when signal fires:**

1. The in-flight `fetch` is aborted immediately.
2. An `AbortError` is thrown (native browser/runtime error — not `FlexDBError` or `FlexDBNetworkError`).
3. Retries are **not** attempted — the abort is final.

**Timeout pattern:**

```ts
// AbortSignal.timeout() (Deno, Bun, Node.js ≥ 18, modern browsers)
const { data } = await db.get("key", {
  signal: AbortSignal.timeout(5_000),
});
```

---

## 14. Runtime Compatibility

The SDK has **zero external dependencies**. It relies exclusively on:
- `fetch` — for HTTP requests
- `URLSearchParams` — for query string construction
- `JSON.stringify` / `JSON.parse` — for body serialisation
- `setTimeout` — for retry delays

| Runtime | Minimum version | Notes |
|---|---|---|
| Cloudflare Workers | Any | Fully supported. |
| Vercel Edge Functions | Any | Fully supported. |
| Deno | 1.0+ | Fully supported. |
| Bun | 1.0+ | Fully supported. |
| Node.js | 18+ | `fetch` became stable in Node.js 18. Earlier versions require a polyfill. |
| Browser | Modern | Works in any browser with native `fetch` support. |

### Using with Node.js < 18

```ts
import fetch from "node-fetch";
// @ts-ignore
globalThis.fetch = fetch;
```
