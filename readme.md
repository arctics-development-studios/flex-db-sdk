# FlexDB SDK

Type-safe, zero-dependency JavaScript / TypeScript client for **FlexDB** — a high-performance distributed key-value store. Built for both edge runtimes (Cloudflare Workers, Vercel Edge) and long-running Node.js servers.

---

## Features

- **Zero dependencies** — only the platform's native `fetch` and `URLSearchParams`
- **Fully typed** — generic data types flow end-to-end with no `any` leakage
- **Built-in retry** — configurable per-client, with sane defaults
- **Namespace binding** — bind a namespace once, forget about it forever
- **Async-iterable pagination** — `for await` over every page with zero boilerplate
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
import { createClient } from "flex-db-sdk";

// Create once — reuse everywhere (module-level singleton recommended)
const db = createClient({
  apiKey:    process.env.FLEXDB_API_KEY!,
  baseUrl:   "https://eu.flex.arctics.dev",
  namespace: "users",              // optional client-level default
});

// ── Create (server-generated key) ─────────────────────────────────────────
const { key } = await db.create({ name: "Alice", age: 30 });

// ── Get ───────────────────────────────────────────────────────────────────
const { item } = await db.get<{ name: string; age: number }>(key);

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
const products = db.namespace<ProductSearchParams>("products");

const { key } = await users.create({ name: "Charlie" });
const { item } = await users.get<User>(key);
```

---

## Search & Indexing

Index fields at write-time using `searchParams`. Query them later with `search()`.

```ts
// Write with indexed fields
await db.create(
  { name: "Widget Pro", price: 49.99, category: "electronics" },
  {
    namespace: "products",
    searchParams: { price: 49.99, category: "electronics", inStock: true },
  },
);

// Query with filter operators
const { ids } = await db.search({
  namespace: "products",
  filters: {
    price:    { gte: 10, lte: 100 },
    category: { eq: "electronics" },
    inStock:  { eq: true },
  },
});
```

### Filter operators

| Operator | Description                                           |
|----------|-------------------------------------------------------|
| `eq`     | Exact match                                           |
| `neq`    | Not equal                                             |
| `gt`     | Greater than                                          |
| `gte`    | Greater than or equal                                 |
| `lt`     | Less than                                             |
| `lte`    | Less than or equal                                    |
| `inc`    | String contains / array includes                      |
| `sw`     | String begins with                                    |
| `ex`     | Attribute exists (`true`) or does not exist (`false`) |

---

## Pagination

### Manual cursor

```ts
let cursor: string | undefined;

do {
  const result = await db.list({ namespace: "users", limit: 50, cursor });
  console.log(result.ids);
  cursor = result.nextCursor;
} while (cursor);
```

### Async-iterable paginator (recommended)

```ts
import { paginateList, paginateSearch } from "flex-db-sdk";

// ── List IDs page-by-page ─────────────────────────────────────────────────
for await (const page of paginateList(db, { namespace: "users", limit: 50 })) {
  console.log(page.data);    // string[]
  console.log(page.hasMore); // false on last page
}

// ── Collect all IDs at once ───────────────────────────────────────────────
const allIds = await paginateList(db, { namespace: "users" }).all();

// ── Full objects page-by-page ─────────────────────────────────────────────
import { paginateListHydrated } from "flex-db-sdk";

for await (const page of paginateListHydrated<User>(db, { namespace: "users", limit: 20 })) {
  for (const { id, data } of page.data) {
    console.log(id, data); // { id: string; data: User | null }
  }
}

// ── Search with pagination ────────────────────────────────────────────────
import { paginateSearch } from "flex-db-sdk";

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
import { FlexDBError, FlexDBNetworkError } from "flex-db-sdk";

try {
  const { item } = await db.get("missing-key");
} catch (err) {
  if (err instanceof FlexDBError) {
    // HTTP-level error — server responded with non-2xx
    console.error(err.status, err.message, err.body);
    if (err.status === 404) { /* not found */ }
    if (err.status === 401) { /* auth failed */ }
    if (err.status === 429) { /* rate limited */ }
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

const { item } = await db.get("some-key", { signal: controller.signal });
```

---

## TypeScript Generics

Type your data and search params for end-to-end safety:

```ts
// Define your shapes once
interface User { name: string; age: number; }

interface UserSP {
  age: number;
  role: "admin" | "viewer";
}

const users = db.namespace<UserSP>("users");

// TypeScript knows `item` is `User`
const { item } = await users.get<User>("abc");

// TypeScript validates filter keys and values
const { ids } = await users.search({
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

**Recommended pattern for edge functions** — instantiate at module scope so the client is reused across requests in the same isolate:

```ts
// lib/db.ts
import { createClient } from "flex-db-sdk";
export const db = createClient({ ... });

// app/api/users/route.ts (Next.js App Router / Vercel Edge)
import { db } from "@/lib/db";
export const runtime = "edge";

export async function GET() {
  const { ids } = await db.list({ namespace: "users" });
  return Response.json({ ids });
}
```

---

## API Reference

### `createClient(options)`
Returns a `FlexDBClient` instance. See [Configuration](#configuration).

### `db.health()`
Checks service liveness. No auth required.

### `db.create(value, options?)`
Creates an item with a server-generated key. Returns `{ success, key }`.

### `db.get<T>(key, options?)`
Retrieves an item by key. Returns `{ success, item: T }`. Throws `FlexDBError(404)` if not found.

### `db.set(key, value, options?)`
Upserts an item at a caller-supplied key. Returns `{ success, key }`.

### `db.delete(key, options?)`
Removes an item. Returns `{ success }`.

### `db.list(options?)`
Lists item keys (or full objects with `hydrate: true`).

### `db.search(options)`
Filters items by indexed search params. Accepts `filters`. Same response shape as `list`.

### `db.namespace(ns)`
Returns a `NamespacedClient` with the namespace baked in.

### `paginateList(client, options?)` / `paginateListHydrated<T>(client, options?)`
Returns an async-iterable `Paginator` for `list` results.

### `paginateSearch(client, options)` / `paginateSearchHydrated<T>(client, options)`
Returns an async-iterable `Paginator` for `search` results.