export const TABLE_PAGE_SIZE_COOKIE = "crm-table-page-size";
export const TABLE_PAGE_SIZES = [10, 20, 50, 100] as const;
export const DEFAULT_TABLE_PAGE_SIZE = 10;

export type TablePageSize = (typeof TABLE_PAGE_SIZES)[number];

export function parseTablePageSize(value?: string): TablePageSize {
  const pageSize = Number(value);

  return TABLE_PAGE_SIZES.includes(pageSize as TablePageSize)
    ? (pageSize as TablePageSize)
    : DEFAULT_TABLE_PAGE_SIZE;
}

export function buildTablePageSizeCookie(
  pageSize: number,
  secure = false,
): string {
  const safePageSize = parseTablePageSize(String(pageSize));
  const secureAttribute = secure ? "; Secure" : "";

  return `${TABLE_PAGE_SIZE_COOKIE}=${safePageSize}; Path=/; Max-Age=31536000; SameSite=Lax${secureAttribute}`;
}

export function persistTablePageSize(pageSize: number): void {
  // biome-ignore lint/suspicious/noDocumentCookie: Server components must read this preference on the next request.
  document.cookie = buildTablePageSizeCookie(
    pageSize,
    window.location.protocol === "https:",
  );
}
