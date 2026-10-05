# CRM Email Sending Policy

## Production scope

CRM email sending is approved only for individualized transactional or
operational messages that recipients can reasonably expect from an existing
relationship. Examples include event logistics, requested follow-up, and
case-specific updates.

Do not use the CRM for newsletters, fundraising appeals, advocacy campaigns,
or other marketing/bulk promotional mail. Those uses remain blocked until the
product has an explicit consent record, a recipient-facing one-click
unsubscribe flow, and the organization has approved the applicable legal basis
and retention policy.

## Suppression rules

- The worker skips every address in the team's suppression list before it
  publishes a batch.
- Signed Scaleway `email_dropped`, `email_mailbox_not_found`,
  `email_blocklisted`, and `email_spam` events mark the recipient as bounced.
  Hard failures and spam reports create or refresh a team suppression.
- Bounced recipients are never included in automatic/manual batch retry.
- An administrator must record an unsubscribe request in Team settings >
  Integrations > Email suppression as soon as it is received.
- Removing a suppression only removes the technical block. It does not create
  consent or establish a legal basis. Do not remove hard-bounce or spam
  suppressions unless the address and recipient request have been independently
  verified.

## Webhook configuration

The public receiver is:

```text
/api/webhooks/scaleway-email
```

It accepts only Scaleway SNS messages whose topic ARN appears in the
comma-separated `SCALEWAY_EMAIL_SNS_TOPIC_ARNS` allowlist. It verifies the SNS
signature, strictly restricts the signing-certificate URL, and requires the
signing certificate to chain to the configured Scaleway trust certificate.

Configure one of these server-only variables with the current long-term
Scaleway SNS trust chain:

```text
SCALEWAY_SNS_TRUST_CHAIN_PEM
SCALEWAY_SNS_TRUST_CHAIN_PEM_BASE64
```

The base64 variant is usually easier to store in a deployment secret. Obtain
the trust chain from Scaleway's documented URL for the SNS region; do not copy
the rotating leaf certificate into this variable. Configure the TEM webhook for
at least `email_delivered`, `email_dropped`, `email_mailbox_not_found`,
`email_blocklisted`, and `email_spam`. Subscription confirmation is followed
only after the signed confirmation message passes the same topic, certificate,
and signature checks.

## Operational checks

Before enabling sends:

1. Apply the email delivery/suppression migration.
2. Set the exact topic allowlist and trust-chain secret on the web service.
3. Confirm the SNS subscription and observe a signed test event.
4. Send only to controlled test recipients.
5. Verify delivered, hard-bounce, and spam events update recipient history.
6. Verify a suppressed address is skipped in a later batch and cannot be
   retried from email history.
7. Keep the production enablement gate closed for marketing/promotional use.
