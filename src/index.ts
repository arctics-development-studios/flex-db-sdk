// ─────────────────────────────────────────────
//  FlexDB SDK · Public API
//  Import everything you need from this one file.
// ─────────────────────────────────────────────

// ── Client ─────────────────────────────────────────────────────────────────

export { FlexDBClient, NamespacedClient } from "./client.ts";

// ── Factory (recommended entry-point) ─────────────────────────────────────

export { createClient } from "./create-client.ts";

// ── Pagination ─────────────────────────────────────────────────────────────

export {
  Paginator,
  paginateList,
  paginateListHydrated,
  paginateSearch,
  paginateSearchHydrated,
} from "./paginator.ts";
export type { Page } from "./paginator.ts";

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
} from "./types.ts";

// ── Errors ─────────────────────────────────────────────────────────────────

export { FlexDBError, FlexDBNetworkError } from "./types.ts";