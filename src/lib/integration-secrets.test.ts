import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import {
  decryptIntegrationSecret,
  encryptIntegrationSecret,
  isEncryptedIntegrationSecret,
} from "./integration-secrets";

const KEY_ENV = "INTEGRATION_SECRET_ENCRYPTION_KEYS";
const key = () => crypto.randomBytes(32).toString("base64");

test("integration secrets use authenticated encryption and support key rotation", async (t) => {
  const original = process.env[KEY_ENV];

  try {
    process.env[KEY_ENV] = `current=${key()}`;
    const ciphertext = encryptIntegrationSecret("provider-secret");

    await t.test("round trips without exposing plaintext", () => {
      assert.equal(isEncryptedIntegrationSecret(ciphertext), true);
      assert.equal(ciphertext.includes("provider-secret"), false);
      assert.equal(decryptIntegrationSecret(ciphertext), "provider-secret");
    });

    await t.test("rejects ciphertext tampering", () => {
      const tampered = `${ciphertext.slice(0, -1)}${ciphertext.endsWith("A") ? "B" : "A"}`;
      assert.throws(
        () => decryptIntegrationSecret(tampered),
        /Unable to decrypt integration secret/,
      );
    });

    await t.test("keeps legacy plaintext readable before migration", () => {
      assert.equal(decryptIntegrationSecret("legacy-secret"), "legacy-secret");
    });

    await t.test("rewraps old ciphertext with the active key", () => {
      const oldKey = key();
      process.env[KEY_ENV] = `old=${oldKey}`;
      const oldCiphertext = encryptIntegrationSecret("rotate-me");

      process.env[KEY_ENV] = `new=${key()},old=${oldKey}`;
      const rotated = encryptIntegrationSecret(oldCiphertext);

      assert.match(rotated, /^enc:v1:new:/);
      assert.equal(decryptIntegrationSecret(rotated), "rotate-me");
    });
  } finally {
    if (original === undefined) {
      delete process.env[KEY_ENV];
    } else {
      process.env[KEY_ENV] = original;
    }
  }
});
