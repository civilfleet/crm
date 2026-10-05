# Email Configuration Guide

This document explains how to configure email sending for the Funding Manager application.

## Overview

The application uses SMTP (Simple Mail Transfer Protocol) for sending emails via Nodemailer. You can use any SMTP provider such as Gmail, Outlook, SendGrid, Mailgun, Brevo, Amazon SES, or any other SMTP-compatible service.

## Configuration

The email provider is configured through environment variables. Production
startup fails if the global SMTP settings are incomplete or invalid. A fully
unconfigured development environment may still use the non-delivering local
fallback.

## SMTP Configuration

### Environment Variables

```env
SMTP_HOST="smtp.example.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="your-smtp-username"
SMTP_PASS="your-smtp-password"
SMTP_FROM="noreply@yourdomain.com"
```

### Variable Descriptions

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SMTP_HOST` | Yes | - | SMTP server hostname |
| `SMTP_PORT` | No | 587 | SMTP server port |
| `SMTP_SECURE` | No | false | Use SSL/TLS encryption |
| `SMTP_USER` | Yes | - | SMTP username |
| `SMTP_PASS` | Yes | - | SMTP password |
| `SMTP_FROM` | Yes | - | Default sender email address used by magic links and application mail |

## Common SMTP Providers

### Gmail

```env
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-specific-password"
SMTP_FROM="your-email@gmail.com"
```

**Important Notes:**
- Gmail requires an app-specific password when 2FA is enabled
- Generate an app password at: https://myaccount.google.com/apppasswords

### Microsoft Outlook

```env
SMTP_HOST="smtp-mail.outlook.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="your-email@outlook.com"
SMTP_PASS="your-password"
SMTP_FROM="your-email@outlook.com"
```

### SendGrid

```env
SMTP_HOST="smtp.sendgrid.net"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="apikey"
SMTP_PASS="your-sendgrid-api-key"
SMTP_FROM="verified-sender@yourdomain.com"
```

**Note:** The username is always `apikey` for SendGrid.

### Mailgun

```env
SMTP_HOST="smtp.mailgun.org"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="postmaster@your-domain.mailgun.org"
SMTP_PASS="your-mailgun-password"
SMTP_FROM="noreply@yourdomain.com"
```

### Brevo (formerly Sendinblue)

```env
SMTP_HOST="smtp-relay.brevo.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="your-brevo-username"
SMTP_PASS="your-brevo-password"
SMTP_FROM="noreply@yourdomain.com"
```

### Amazon SES

```env
SMTP_HOST="email-smtp.us-east-1.amazonaws.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="your-ses-smtp-username"
SMTP_PASS="your-ses-smtp-password"
SMTP_FROM="verified-email@yourdomain.com"
```

**Note:** Replace `us-east-1` with your AWS region.

## Port and Security Settings

### Common Port Configurations

- **Port 587**: STARTTLS (recommended) - Set `SMTP_SECURE="false"`
- **Port 465**: SSL/TLS - Set `SMTP_SECURE="true"`
- **Port 25**: Unencrypted (not recommended, often blocked)

## Verification and Testing

After configuration, look for this log message when starting the app:

```
[mail] Email provider configured: SMTP
```

When sending emails, you'll see:

```
[mail] Dispatching email { to: '...', subject: '...', template: '...' }
[mail] Email dispatched { to: '...', subject: '...', messageId: '...' }
```

## Troubleshooting

### Common Issues

1. **Authentication failed** - Check credentials, some providers need API keys
2. **Port blocked** - Try port 587 or 465 instead of 25
3. **Gmail issues** - Use app-specific password with 2FA enabled
4. **Domain not verified** - Verify sender domain with your provider
5. **Connection timeout** - Check firewall settings

## Best Practices

1. Use environment variables for credentials
2. Enable TLS/SSL encryption
3. Verify sender domain for better deliverability
4. Monitor email logs for failures
5. Use dedicated email service (not personal accounts)
6. Configure SPF/DKIM/DMARC DNS records

## Support

For issues:
1. Check application logs
2. Verify SMTP credentials with provider
3. Test connection independently (`telnet smtp.example.com 587`)
4. Review provider's documentation
5. Open an issue on the repository

## Additional Resources

- [Nodemailer Documentation](https://nodemailer.com/)
- [Gmail App Passwords](https://support.google.com/accounts/answer/185833)
- [Email Authentication (SPF, DKIM, DMARC)](https://www.cloudflare.com/learning/email-security/dmarc-dkim-spf/)
