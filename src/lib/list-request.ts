/*
  A list request: which page, how many, in which order. The route frame
  (lib/route, its `list` option) reads it from the query string, and the
  lists' screens write the same query string (formatRecordSorts). Filters
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
  /** The first of `sorts`. Undefined when there is none and no fallback. */
  sort?: RecordSort<Field>;
  /**
   * Every order, most important first ("name, then city"): at most
   * MAX_SORTS, each field once. Empty when there is none and no fallback.
   */
  sorts: RecordSort<Field>[];
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
/** A list orders by at most this many columns at once. */
export const MAX_SORTS = 3;
export const MAX_PAGE_SIZE = 100;

const positive = (value: string | null) => {
  const number = Number(value);
  return value && Number.isFinite(number) && number >= 1
    ? Math.floor(number)
    : undefined;
};

const isDirection = (value: unknown): value is SortDirection =>
  value === "asc" || value === "desc";

/**
 * The orders a request asks for: `sort=name:asc,city:desc`, or the single
 * `sort=name&dir=desc` of older links. Unknown fields and repeats are
 * dropped; with nothing left, the list's fallback.
 */
const readSorts = (
  searchParams: URLSearchParams,
  { sort: fields = [], fallback }: ListOptions,
): RecordSort<string>[] => {
  const value = searchParams.get("sort") ?? "";
  const legacyDirection = searchParams.get("dir");
  const sorts: RecordSort<string>[] = [];
  for (const part of value.split(",")) {
    const [field, direction] = part.trim().split(":");
    if (!field || !fields.includes(field)) continue;
    if (sorts.some((sort) => sort.field === field)) continue;
    sorts.push({
      field,
      direction: isDirection(direction)
        ? direction
        : isDirection(legacyDirection)
          ? legacyDirection
          : "asc",
    });
    if (sorts.length === MAX_SORTS) break;
  }
  if (sorts.length > 0) return sorts;
  return fallback ? [fallback] : [];
};

/**
 * The page, page size and order a list request asks for, within bounds:
 * anything broken falls back rather than failing.
 */
export const readListRequest = (
  searchParams: URLSearchParams,
  options: ListOptions = {},
): ListRequest => {
  const sorts = readSorts(searchParams, options);
  return {
    page: positive(searchParams.get("page")) ?? 1,
    pageSize: Math.min(
      positive(searchParams.get("pageSize")) ??
        options.pageSize ??
        DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    ),
    ...(sorts[0] ? { sort: sorts[0] } : {}),
    sorts,
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

/** Query-string value of one or more orders: "name:asc,city:desc". */
export const formatRecordSorts = (sorts: readonly RecordSort<string>[]) =>
  sorts.map((sort) => `${sort.field}:${sort.direction}`).join(",");

/**
 * A Prisma `orderBy` for several orders: each order's own steps (`step`),
 * most important first, then the tie-breaker that keeps rows with equal
 * values in one order across pages.
 */
export const chainOrderBy = <Field extends string, OrderBy>(
  sorts: readonly RecordSort<Field>[],
  step: (sort: RecordSort<Field>) => OrderBy | OrderBy[],
  tieBreaker: OrderBy,
): OrderBy[] => [...sorts.flatMap((sort) => step(sort)), tieBreaker];

/*
  What clicking a sortable column header does to a list's orders. A click
  orders by that column alone: ascending, then descending, then off. With
  Shift held it adds the column as the next order (at most MAX_SORTS), or
  turns an order the list already has from ascending to descending, then
  removes it, keeping the others.
*/
export const nextSorts = (
  sorts: readonly RecordSort<string>[],
  field: string,
  isAdding: boolean,
): RecordSort<string>[] => {
  const current = sorts.find((sort) => sort.field === field);
  const following = (
    sort: RecordSort<string> | undefined,
  ): RecordSort<string> | null =>
    !sort
      ? { field, direction: "asc" }
      : sort.direction === "asc"
        ? { field, direction: "desc" }
        : null;

  if (!isAdding) {
    const next = following(sorts.length === 1 ? current : undefined);
    return next ? [next] : [];
  }
  if (!current) {
    return sorts.length >= MAX_SORTS
      ? [...sorts]
      : [...sorts, { field, direction: "asc" }];
  }
  const next = following(current);
  return next
    ? sorts.map((sort) => (sort.field === field ? next : sort))
    : sorts.filter((sort) => sort.field !== field);
};
