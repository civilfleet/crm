# CRM

A modular CRM platform built with Next.js to manage relationships, records, workflows, and funding operations between provider teams and partner organizations.

## Overview

The app supports three primary roles:
- **Organizations**: partner entities that maintain profiles and submit requests
- **Teams**: provider-side users who manage CRM workflows and funding pipelines
- **Admins**: platform administrators managing tenants, access, and configuration

The data model supports both application modules:
- **CRM**: contacts, organizations, lists, engagements, events, and groups
- **FUNDING**: requests, agreements, files, and transactions

## Key Features

- Centralized organization, team, and user records
- Contact and list management with engagement tracking
- Event and event-role management
- Organization engagement timeline and custom organization field values
- Funding request pipeline and status tracking
- Donation agreement workflow with signature tracking
- Transaction and receipt tracking
- Secure document storage and download auditing
- Team-level OIDC + email magic-link authentication
- Role-based access control and protected routes

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **UI**: React 19, Tailwind CSS v4, Radix UI
- **Language**: TypeScript (strict mode)
- **Database**: PostgreSQL + Prisma ORM
- **Authentication**: NextAuth.js (email magic link + team OIDC)
- **Storage**: S3-compatible object storage + AWS SDK
- **Email**: SMTP via Nodemailer
- **Observability**: Sentry
- **Code Quality**: Biome

## Core Domain

Primary entities include:
- `Organization`, `Teams`, `User`
- `Contact`, `ContactList`, `ContactEngagement`
- `OrganizationEngagement`, `OrganizationType`
- `Event`, `EventType`, `EventRole`
- `FundingRequest`, `DonationAgreement`, `Transaction`
- `File`, `FileDownloadAudit`, `Group`

Funding request workflow:

```text
Submitted -> Accepted -> WaitingForSignature -> Approved -> FundsDisbursing -> Completed
                  \-> Rejected (possible at any stage)
```

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL
- S3-compatible object storage bucket
- SMTP provider

### Installation

1. Clone the repository

```bash
git clone <repository-url>
cd funding-manager
```

2. Install dependencies

```bash
yarn install
```

3. Configure environment

```bash
cp .env.example .env.local
```

Then set required values in `.env.local` (see `.env.example` for the full list).

4. Set up database

```bash
npx prisma generate
npx prisma migrate dev
```

5. (Optional) Seed default form config

```bash
npx tsx scripts/populate-default-form-config.ts
```

6. Start development server

```bash
yarn dev
```

Application URL: `http://localhost:3000`

### Docker Compose

To run the app, Postgres, schema bootstrap, and the Zammad worker together:

```bash
docker compose up --build
```

The `migrate` service uses `prisma db push` for local Docker bootstrap because the historical migration order does not replay cleanly into an empty database. Use `prisma migrate deploy` for production databases whose migration history is already established. The `worker` service runs the Zammad worker from the same image as the web app and processes queued sync jobs outside API requests.

## Available Scripts

```bash
# Development
yarn dev
yarn build
yarn start
yarn zammad:worker

# Quality checks
yarn lint          # biome lint .
yarn lint:fix      # biome lint . --write
yarn format        # biome format .
yarn check         # biome check + tsc
yarn typecheck     # tsc --noEmit

# S3 CORS helpers
yarn s3:cors:print
yarn s3:cors:check
yarn s3:cors:apply
```

## S3 CORS Bootstrap

For direct browser uploads with pre-signed URLs, bucket CORS must allow preflight and `PUT`.

Required runtime storage vars (see `.env.example`):

```env
NEXT_AWS_S3_ACCESS_KEY="..."
NEXT_AWS_S3_ACCESS_SECRET="..."
NEXT_AWS_S3_BUCKET_NAME="..."
NEXT_AWS_S3_BUCKET_REGION="..."
NEXT_AWS_S3_ENDPOINT="https://s3.<your-region>.provider.com"
```

Optional CORS script overrides:

```env
S3_CORS_ALLOWED_ORIGINS="http://localhost:3000,http://127.0.0.1:3000"
S3_CORS_ALLOWED_METHODS="GET,HEAD,PUT"
S3_CORS_ALLOWED_HEADERS="*"
S3_CORS_EXPOSE_HEADERS="ETag"
S3_CORS_MAX_AGE_SECONDS="3000"
S3_FORCE_PATH_STYLE="true"
```

`manage-s3-cors.ts` loads env files in this order:
`.env` -> `.env.local` -> `.env.{NODE_ENV}` -> `.env.{NODE_ENV}.local`.

## Project Structure

```text
app/                Next.js routes, pages, layouts, API endpoints
components/         Reusable UI components
services/           Domain/business logic by feature
lib/                Shared utilities and clients (Prisma, S3, mail, auth)
prisma/             Schema and migrations
templates/          Handlebars email templates
scripts/            Operational and data helper scripts
```

## Auth & Authorization

- NextAuth session strategy with JWT
- Email magic-link auth
- Team-specific OIDC providers
- Optional OIDC auto-provisioning by verified team domain
- Role-based route protection for `Admin`, `Team`, and `Organization`

## Deployment Notes

- Configure all required environment variables in production
- Ensure `NEXTAUTH_URL` matches your deployed domain
- Run production migrations:

```bash
npx prisma migrate deploy
```

## Contributing

1. Create a feature branch
2. Make focused changes with clear commits
3. Run `yarn typecheck` and relevant checks
4. Open a PR with summary, verification steps, and screenshots for UI changes

## License

MIT. See [LICENSE](LICENSE).
