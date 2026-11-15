/*
  A list request: which page, how many, in which order. The route frame
  (lib/route, its `list` option) reads it from the query string, and the
  lists' screens write the same query string (formatRecordSort). Filters
  aren't part of it: they're each route's own `query` schema.

  A paged list answers { data, total, page, pageSize }; one asked for
  without paging (a picker, with paging "optional") answers { data }.
*/

export type SortDirection = "asc" | "desc";

export type RecordSort<Field extends string> = {
  field: Field;
  direction: SortDirection;
};

export type ListRequest<Field extends string = string> = {
  page: number;
  pageSize: number;
  /** Undefined when the request has none and the list has no fallback. */
  sort?: RecordSort<Field>;
};

export type ListOptions = {
  /** The fields it can be ordered by: nothing else reaches the database. */
  sort?: readonly string[];
  /** The order when the request has none (or one not on the list). */
  fallback?: RecordSort<string>;
  /** When the request says none (default 50). */
  pageSize?: number;
  /**
   * "always" (the default) pages every request; "optional" answers every
   * row when the request asks for neither a page nor a page size.
   */
  paging?: "always" | "optional";
};

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

const positive = (value: string | null) => {
  const number = Number(value);
  return value && Number.isFinite(number) && number >= 1
    ? Math.floor(number)
    : undefined;
};

const readSort = (
  searchParams: URLSearchParams,
  { sort: fields = [], fallback }: ListOptions,
): RecordSort<string> | undefined => {
  const field = searchParams.get("sort");
  if (!field || !fields.includes(field)) return fallback;
  const direction = searchParams.get("dir");
  return {
    field,
    direction: direction === "asc" || direction === "desc" ? direction : "asc",
  };
};

/**
 * The page, page size and order a list request asks for, within bounds:
 * anything broken falls back rather than failing.
 */
export const readListRequest = (
  searchParams: URLSearchParams,
  options: ListOptions = {},
): ListRequest => {
  const sort = readSort(searchParams, options);
  return {
    page: positive(searchParams.get("page")) ?? 1,
    pageSize: Math.min(
      positive(searchParams.get("pageSize")) ??
        options.pageSize ??
        DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    ),
    ...(sort ? { sort } : {}),
  };
};

/**
 * As the route frame reads it: null when the list's paging is optional
 * and the request asks for neither a page nor a page size.
 */
export const readList = (
  searchParams: URLSearchParams,
  options: ListOptions,
): ListRequest | null =>
  options.paging === "optional" &&
  !searchParams.has("page") &&
  !searchParams.has("pageSize")
    ? null
    : readListRequest(searchParams, options);

/** Query-string form of a sort, for SWR keys and links. */
export const formatRecordSort = <Field extends string>(
  sort: RecordSort<Field> | null,
) => (sort ? `&sort=${sort.field}&dir=${sort.direction}` : "");
