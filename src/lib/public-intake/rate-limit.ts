import { isIP } from "node:net";

/*
  Who the public bridge's per-IP limits count as one source.

  IPv4 counts per address. Mobile carriers put many customers behind one
  address (CGNAT), so the limit is generous (RATE_LIMIT_PER_HOUR) and the
  captcha, not this limit, keeps scripts out.

  IPv6 counts per /64: one connection usually gets a whole /64, billions of
  addresses, so counting single addresses would be no brake at all.
*/

export const DEFAULT_RATE_LIMIT_PER_HOUR = 300;

/** The per-hour limit from configuration, or the default. */
export const readRateLimitPerHour = (value?: string) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : DEFAULT_RATE_LIMIT_PER_HOUR;
};

/** Expands an IPv6 address to its eight groups. */
const ipv6Groups = (address: string) => {
  const [head, tail = ""] = address.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const missing = address.includes("::") ? 8 - left.length - right.length : 0;
  return [...left, ...Array(missing).fill("0"), ...right].map((group) =>
    group.toLowerCase().replace(/^0+(?=.)/, ""),
  );
};

/** The source an address counts as: itself for IPv4, its /64 for IPv6. */
export const rateLimitSource = (address: string | undefined) => {
  if (!address) return "unknown";
  const plain = address.replace(/^\[|\]$/g, "").split("%")[0];
  // IPv4 written as IPv6 (::ffff:203.0.113.7) is the IPv4 address.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(plain);
  if (mapped) return mapped[1];
  if (isIP(plain) === 6)
    return `${ipv6Groups(plain).slice(0, 4).join(":")}::/64`;
  return plain;
};
