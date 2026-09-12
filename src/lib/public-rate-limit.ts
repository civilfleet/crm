import { ApiError } from "@/lib/api-guard";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const entries = new Map<string, RateLimitEntry>();
const MAX_ENTRIES = 10_000;
const CLEANUP_INTERVAL_MS = 60_000;
let nextCleanupAt = 0;

const getClientAddress = (request: Request) =>
  request.headers.get("x-real-ip")?.trim() ||
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  "unknown";

export const enforcePublicRateLimit = (
  request: Request,
  scope: string,
  { limit, windowMs }: { limit: number; windowMs: number },
) => {
  const now = Date.now();
  if (now >= nextCleanupAt || entries.size >= MAX_ENTRIES) {
    for (const [entryKey, entry] of entries) {
      if (entry.resetAt <= now) entries.delete(entryKey);
    }
    nextCleanupAt = now + CLEANUP_INTERVAL_MS;
  }
  const key = `${scope}:${getClientAddress(request)}`;
  const current = entries.get(key);

  if (!current || current.resetAt <= now) {
    if (!current && entries.size >= MAX_ENTRIES) {
      throw new ApiError(429, "Too many requests - Please try again later");
    }
    entries.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  if (current.count >= limit) {
    throw new ApiError(429, "Too many requests - Please try again later");
  }

  current.count += 1;
};
