import { randomUUID } from "node:crypto";
import { resolveTxt } from "node:dns/promises";

export const buildDomainVerificationRecordName = (domain: string) =>
  `_fm-sso.${domain}`;

export const buildDomainVerificationRecordValue = (token: string) =>
  `fm-verify-${token}`;

export const generateDomainVerificationToken = () =>
  randomUUID().replace(/-/g, "");

export const resolveTxtRecordValues = async (recordName: string) => {
  const records = await resolveTxt(recordName);
  return records.map((parts) => parts.join("").trim());
};
