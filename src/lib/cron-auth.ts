import { timingSafeEqual } from "node:crypto";

export const hasValidBearerSecret = (
  authorization: string | null,
  expected: string | undefined,
) => {
  if (!expected || !authorization?.startsWith("Bearer ")) return false;

  const actual = authorization.slice("Bearer ".length);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return (
    expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  );
};
