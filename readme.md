# FlexDB SDK

Type-safe, zero-dependency JavaScript / TypeScript client for **FlexDB** — a high-performance distributed key-value store with automatic storage tiering. Built for edge runtimes (Cloudflare Workers, Vercel Edge) and long-running Node.js servers alike.

---

## Features

- **Zero dependencies** — only the platform's native `fetch` and `URLSearchParams`
- **Fully typed** — generic data types flow end-to-end with no `any` leakage
- **Built-in retry** — configurable per-client, with sane defaults
- **Namespace binding** — bind a namespace once, forget about it forever
- **Async-iterable pagination** — `for await` over every page with zero boilerplate
- **Bulk operations** — create, set, or delete multiple objects in a single request
- **Edge-first** — works in Cloudflare Workers, Vercel Edge, Deno, Bun, and Node ≥ 18
- **Singleton-friendly** — one client instance per process maximises keep-alive reuse

---

## Installation

```bash
# For Node.js / npm
npx jsr add @arctics/flex-db-sdk

# For Deno
deno add @arctics/flex-db-sdk

# For Bun
bunx jsr add @arctics/flex-db-sdk
```

---

## Quick Start

```ts
import { createClient } from "@arctics/flex-db-sdk";

// Create once — reuse everywhere (module-level singleton recommended)
const db = createClient({
  apiKey:    process.env.FLEXDB_API_KEY!,
  baseUrl:   "https://eu.flex.arctics.dev",
  namespace: "users",              // optional client-level default
});

// ── Create (server-generated key) ─────────────────────────────────────────
const { key } = await db.create({ name: "Alice", age: 30 });

// ── Get ───────────────────────────────────────────────────────────────────
const { data } = await db.get<{ name: string; age: number }>(key);

// ── Set / upsert with your own key ────────────────────────────────────────
await db.set("my-custom-key", { name: "Bob", age: 25 });

// ── Delete ────────────────────────────────────────────────────────────────
await db.delete(key);
```

---

## Configuration

```ts
createClient({
  // Required
  apiKey:  "your-jwt-token",
  baseUrl: "https://eu.flex.arctics.dev",

  // Optional — default namespace for every call
  namespace: "my-collection",

  // Optional — retry config (shown: defaults)
  retry: {
    times: 3,   // max retries after first failure (0–10)
    delay: 10,  // ms between retries
  },

  // Disable retries entirely
  // retry: false,
});
```

### Retry behaviour

| Scenario               | Retried? |
|------------------------|----------|
| Network failure        | ✅       |
| HTTP 429 (rate limit)  | ✅       |
| HTTP 5xx (server error)| ✅       |
| HTTP 4xx (client error)| ❌       |
| AbortSignal fired      | ❌       |

Retries are capped at **10** regardless of the value provided.

---

## Namespaces

All operations require a namespace. You can provide it:

1. **Client-level default** (set once in `createClient`)
2. **Per-call override** (pass `namespace` in the operation options)
3. **Bound namespace client** (recommended for domain-specific code)

```ts
// Option 3 — namespace binding (cleanest)
const users    = db.namespace("users");
const products = db.namespace("products");

const { key }  = await users.create({ name: "Charlie" });
const { data } = await users.get<User>(key);
```

---

## Search & Indexing

Index fields at write-time using the `sp` option. Query them later with `search()`.

> **Note:** Objects appear in `list` and `search` results only after the write-buffer flushes to permanent storage (~60 seconds). `get()` is always immediate.

```ts
// Write with indexed search properties
await db.create(
  { name: "Widget Pro", price: 49.99, category: "electronics" },
  {
    namespace: "products",
    sp: { price: 49.99, category: "electronics", inStock: true },
  },
);

// Query with filter operators
const { keys } = await db.search({
  namespace: "products",
  filters: {
    price:    { gte: 10, lte: 100 },
    category: { eq: "electronics" },
  },
});
```

### Filter operators

| Operator      | Description              |
|---------------|--------------------------|
| `eq`          | Exact match              |
| `ne`          | Not equal                |
| `gt`          | Greater than             |
| `gte`         | Greater than or equal    |
| `lt`          | Less than                |
| `lte`         | Less than or equal       |
| `contains`    | String contains          |
| `starts_with` | String begins with       |

---

## Bulk Operations

Create, set, get, or delete multiple objects in a single HTTP request.

```ts
// ── bulkCreate — server-generated keys ───────────────────────────────────
const { items } = await db.bulkCreate(
  [
    { data: { name: "Alice" }, sp: { role: "admin" } },
    { data: { name: "Bob" },   sp: { role: "viewer" } },
  ],
  { namespace: "users" },
);
const keys = items.filter(r => r.ok).map(r => r.id!);
console.log(keys); // ["<nanoid1>", "<nanoid2>"]

// ── bulkSet — caller-supplied keys (full replace) ─────────────────────────
const { items: setResults } = await db.bulkSet(
  [
    { key: "user-1", data: { name: "Alice" } },
    { key: "user-2", data: { name: "Bob" } },
  ],
  { namespace: "users" },
);

// ── bulkGet ───────────────────────────────────────────────────────────────
const { items: getResults } = await db.bulkGet(
  ["user-1", "user-2", "user-3"],
  { namespace: "users" },
);
for (const item of getResults) {
  if (item.ok) console.log(item.key, item.data);
  else console.log(item.key, "not found");
}

// ── bulkDelete ────────────────────────────────────────────────────────────
await db.bulkDelete(["user-1", "user-2", "user-3"], { namespace: "users" });
```

**Notes:**
- Non-existent keys in `bulkDelete()` are silently skipped.
- Maximum items per bulk request is server-configured (default 100 for get, varies for others).

---

## Pagination

### Manual cursor

```ts
let cursor: string | undefined;

do {
  const result = await db.list({ namespace: "users", limit: 50, cursor });
  console.log(result.keys);
  cursor = result.cursor ?? undefined;
} while (cursor);
```

### Async-iterable paginator (recommended)

```ts
import { paginateList, paginateListHydrated, paginateSearch } from "@arctics/flex-db-sdk";

// ── List keys page-by-page ────────────────────────────────────────────────
for await (const page of paginateList(db, { namespace: "users", limit: 50 })) {
  console.log(page.data);    // string[]
  console.log(page.hasMore); // false on last page
}

// ── Collect all keys at once ──────────────────────────────────────────────
const allKeys = await paginateList(db, { namespace: "users" }).all();

// ── Full objects page-by-page ─────────────────────────────────────────────
for await (const page of paginateListHydrated<User>(db, { namespace: "users", limit: 50 })) {
  for (const { key, data } of page.data) {
    console.log(key, data);
  }
}

// ── Search with pagination ────────────────────────────────────────────────
const pages = paginateSearch(db, {
  namespace: "products",
  filters: { category: { eq: "books" } },
  limit: 50,
});

for await (const page of pages) {
  process(page.data); // string[]
}
```

---

## Error handling

```ts
import { FlexDBError, FlexDBNetworkError } from "@arctics/flex-db-sdk";

try {
  const { data } = await db.get("missing-key");
} catch (err) {
  if (err instanceof FlexDBError) {
    // HTTP-level error — server responded with non-2xx
    // Branch on `code` (stable) rather than `status` or `message`
    switch (err.code) {
      case "ERR_NOT_FOUND":         /* object does not exist */; break;
      case "ERR_UNAUTHORIZED":      /* invalid or expired token */; break;
      case "ERR_PERMISSION_DENIED": /* token lacks required permission */; break;
      case "ERR_RATE_LIMIT_SECOND": /* per-second limit hit — slow down */; break;
      case "ERR_RATE_LIMIT_MONTH":  /* monthly limit exhausted */; break;
      case "ERR_BULK_TOO_LARGE":    /* too many items in bulk request */; break;
      case "ERR_INVALID_KEY":       /* key fails nanoid constraints */; break;
    }
    if (err.hint) console.info("Hint:", err.hint);
    console.error(err.status, err.message, err.body);
  } else if (err instanceof FlexDBNetworkError) {
    // Transport-level error — fetch itself failed
    console.error("Network error:", err.message, err.cause);
  } else {
    throw err; // unexpected — rethrow
  }
}
```

---

## Cancellation

Every operation accepts an `AbortSignal` for cancellation:

```ts
const controller = new AbortController();
setTimeout(() => controller.abort(), 5000); // 5s timeout

const { data } = await db.get("some-key", { signal: controller.signal });
```

---

## Write-buffer visibility lag

Writes (`set`, `create`, `bulkSet`, `bulkCreate`) land in the cache tier immediately and are readable via `get` straight away. However, they are committed to permanent storage asynchronously (~60 seconds).

**Effect on queries:**
- `get()` — immediate
- `delete()` — immediate
- `list()`, `search()` — up to ~60 s lag for newly written objects

This is by design. Plan your application around it.

---

## TypeScript Generics

Type your data shapes for end-to-end safety:

```ts
interface User { name: string; age: number; }
interface UserSP { age: number; role: "admin" | "viewer"; }

const users = db.namespace("users");

// TypeScript knows `data` is `User`
const { data } = await users.get<User>("abc");

// TypeScript validates filter keys and values
const { keys } = await users.search<UserSP>({
  filters: {
    age:  { gte: 18 },
    role: { eq: "admin" },
  },
});
```

---

## Edge Runtime Notes

The SDK has **zero dependencies** and uses only:
- `fetch` (global in all modern runtimes)
- `URLSearchParams` (global everywhere)
- `AbortController` / `AbortSignal` (global everywhere)

No Node.js-specific APIs are used. Drop it into any runtime.

**Recommended pattern for edge functions** — instantiate at module scope:

```ts
// lib/db.ts
import { createClient } from "@arctics/flex-db-sdk";
export const db = createClient({ ... });

// app/api/users/route.ts (Next.js App Router / Vercel Edge)
import { db } from "@/lib/db";
export const runtime = "edge";

export async function GET() {
  const { keys } = await db.list({ namespace: "users" });
  return Response.json({ keys });
}
```

---

## API Reference

### `createClient(options)`
Returns a `FlexDBClient` instance. See [Configuration](#configuration).

### `db.health()`
Checks service liveness. No auth required.

### `db.create(value, options?)`
Creates an object with a server-generated nanoid key. Returns `{ key }`.

### `db.get<T>(key, options?)`
Retrieves an object by key. Returns `{ data: T }`. Throws `FlexDBError` with `code === "ERR_NOT_FOUND"` if the key does not exist.

### `db.set(key, value, options?)`
Upserts an object at a caller-supplied key (full replace). Returns `{ key }`.

### `db.delete(key, options?)`
Removes an object. Non-existent keys are silently ignored.

### `db.list(options?)`
Lists object keys (or full objects with `hydrate: true`). Returns `{ keys, cursor }` or `{ items, cursor }`.

### `db.search(options)`
Filters objects by indexed `sp` fields. Requires `filters`. Returns `{ keys, cursor }` or `{ items, cursor }` when `hydrate: true`.

### `db.bulkCreate(items, options?)`
Creates multiple objects with server-generated keys. Returns `{ items: [{ ok, id? }] }`.

### `db.bulkSet(items, options?)`
Upserts multiple objects at caller-supplied keys. Returns `{ items: [{ ok, error? }] }`.

### `db.bulkGet(keys, options?)`
Fetches multiple objects in a single request. Returns `{ items: [{ key, ok, data? }] }`.

### `db.bulkDelete(keys, options?)`
Deletes multiple objects. Non-existent keys are skipped.

### `db.namespace(ns)`
Returns a `NamespacedClient` with the namespace baked in to all operations.

### `paginateList(client, options?)` / `paginateListHydrated<T>(client, options?)`
Returns an async-iterable `Paginator` for `list` results.

### `paginateSearch(client, options)` / `paginateSearchHydrated<T>(client, options)`
Returns an async-iterable `Paginator` for `search` results.
