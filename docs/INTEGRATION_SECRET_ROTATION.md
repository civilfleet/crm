# Integration Secret Encryption and Rotation

CRM encrypts persisted Scaleway, Klaviyo, and Zammad API keys and Zammad webhook
secrets with AES-256-GCM. The encryption keyring is independent from login and
inbound-mail secrets.

## Keyring format

Set `INTEGRATION_SECRET_ENCRYPTION_KEYS` in every web and worker process:

```text
INTEGRATION_SECRET_ENCRYPTION_KEYS=2026-10=<base64-32-byte-key>
```

Generate a key with `openssl rand -base64 32`. Key IDs may contain letters,
numbers, `.`, `_`, and `-`. The first key is active for new encryption; later
keys are decrypt-only. Never remove an old key while database values still use
it.

## Initial encryption

1. Back up the database and record a rollback point.
2. Add one new key to the web and worker environments and deploy the same image
   to both services.
3. Verify integration settings can still be read. Legacy plaintext remains
   readable during this transition.
4. Run `yarn secrets:rotate-integrations` once against the production database.
   The command validates every value before writing and rotates all records in a
   transaction. It prints counts, never secret values.
5. Verify Scaleway sender status/test delivery, Klaviyo sync, Zammad connection,
   and a signed Zammad webhook.

## Routine rotation

1. Prepend the new key and retain the prior keys, for example:
   `new=<new-key>,current=<current-key>`.
2. Deploy that keyring to all web and worker instances before rotating data.
3. Run `yarn secrets:rotate-integrations` once.
4. Restart or redeploy all instances with only the new key after the command and
   integration smoke tests succeed.

If rotation fails because a key is unavailable, ciphertext is corrupt, or a
record changes concurrently, the transaction rolls back. Restore the complete
old keyring and investigate before retrying. A database rollback also requires
the keyring that encrypted the restored snapshot.
