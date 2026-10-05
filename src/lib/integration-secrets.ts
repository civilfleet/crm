import crypto from "node:crypto";

const PREFIX = "enc:v1";
const KEY_ENV = "INTEGRATION_SECRET_ENCRYPTION_KEYS";

type EncryptionKey = { id: string; key: Buffer };

const getKeyring = (): EncryptionKey[] => {
  const configured = process.env[KEY_ENV]?.trim();
  if (!configured) {
    throw new Error(`${KEY_ENV} is required to encrypt integration secrets.`);
  }

  const seen = new Set<string>();
  return configured.split(",").map((entry) => {
    const separator = entry.indexOf("=");
    if (separator <= 0) {
      throw new Error(`${KEY_ENV} entries must use key-id=base64-key.`);
    }
    const id = entry.slice(0, separator).trim();
    const encodedKey = entry.slice(separator + 1).trim();
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(id) || seen.has(id)) {
      throw new Error(`${KEY_ENV} contains an invalid or duplicate key ID.`);
    }
    seen.add(id);
    const key = Buffer.from(encodedKey, "base64");
    if (key.length !== 32) {
      throw new Error(`${KEY_ENV} key ${id} must decode to exactly 32 bytes.`);
    }
    return { id, key };
  });
};

export const isEncryptedIntegrationSecret = (value: string) =>
  value.startsWith(`${PREFIX}:`);

export const decryptIntegrationSecret = (value: string) => {
  if (!isEncryptedIntegrationSecret(value)) return value;

  const parts = value.split(":");
  if (parts.length !== 6) {
    throw new Error("Invalid encrypted integration secret format.");
  }
  const [, , keyId, ivValue, tagValue, ciphertextValue] = parts;
  const encryptionKey = getKeyring().find(({ id }) => id === keyId);
  if (!encryptionKey) {
    throw new Error(
      `Integration secret encryption key ${keyId} is unavailable.`,
    );
  }

  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      encryptionKey.key,
      Buffer.from(ivValue, "base64url"),
    );
    decipher.setAAD(Buffer.from(`${PREFIX}:${keyId}`));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Unable to decrypt integration secret.");
  }
};

export const encryptIntegrationSecret = (value: string) => {
  const plaintext = decryptIntegrationSecret(value);
  const [activeKey] = getKeyring();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", activeKey.key, iv);
  cipher.setAAD(Buffer.from(`${PREFIX}:${activeKey.id}`));
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return [
    PREFIX,
    activeKey.id,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
};
