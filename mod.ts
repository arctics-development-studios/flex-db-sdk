// ─────────────────────────────────────────────
//  FlexDB SDK · Public API
//  Import everything you need from this one file.
// ─────────────────────────────────────────────

// ── Client ─────────────────────────────────────────────────────────────────

export { FlexDBClient, NamespacedClient } from "./src/client.ts";

// ── Factory (recommended entry-point) ─────────────────────────────────────

export { createClient } from "./src/create-client.ts";

// ── Pagination ─────────────────────────────────────────────────────────────

export {
  Paginator,
  paginateList,
  paginateListHydrated,
  paginateSearch,
  paginateSearchHydrated,
} from "./src/paginator.ts";
export type { Page } from "./src/paginator.ts";

// ── Types ──────────────────────────────────────────────────────────────────

export type {
  // Config
  RetryConfig,
  FlexDBClientOptions,

  // Operation options
  OperationOptions,
  SetOptions,
  GetOptions,
  DeleteOptions,
  ListOptions,
  SearchOptions,

  // Data shapes
  SearchParams,
  Filters,
  FilterOperators,

  // Results
  CreateResult,
  SetResult,
  GetResult,
  DeleteResult,
  ListIdsResult,
  ListItemsResult,
  ListResult,
} from "./src/types.ts";

// ── Errors ─────────────────────────────────────────────────────────────────

export { FlexDBError, FlexDBNetworkError } from "./src/types.ts";
