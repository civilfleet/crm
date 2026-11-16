# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a funding management application built with Next.js 15, focusing on managing funding requests, donation agreements, and organizational relationships. The application serves three primary user roles: Organizations (funding recipients), Teams (funding providers), and Admins (system administrators).

## Development Commands

```bash
# Development server with Turbopack
yarn dev

# Build the application
yarn build

# Start production server
yarn start

# Run linting
yarn lint

# Database operations
npx prisma generate      # Generate Prisma client
npx prisma migrate dev   # Run database migrations
npx prisma db push       # Push schema changes to database
npx prisma studio        # Open Prisma Studio
```

## Architecture Overview

### Core Domain Models
- **Organizations**: Non-profit entities that submit funding requests
- **Teams**: Funding providers that review and approve requests
- **Users**: Individuals with roles (Organization, Team, Admin)
- **FundingRequests**: Applications for funding with status workflow
- **DonationAgreements**: Legal agreements between teams and organizations
- **Transactions**: Financial transfers with receipt tracking
- **Files**: Document management with S3 storage

### Tech Stack
- **Framework**: Next.js 15 with App Router
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: NextAuth.js with email-based login
- **UI**: Tailwind CSS with Radix UI components (shadcn/ui)
- **File Storage**: AWS S3
- **Email**: Brevo/Nodemailer for notifications
- **Monitoring**: Sentry for error tracking

### Project Structure
- `app/` - Next.js App Router pages and API routes
  - `admin/` - Admin dashboard pages
  - `organizations/[organizationId]/` - Organization-specific pages
  - `teams/[teamId]/` - Team-specific pages
  - `api/` - API endpoints for all entities
- `components/` - Reusable UI components
  - `ui/` - Base UI components (shadcn/ui)
  - `forms/` - Form components with validation
  - `table/` - Data table components
- `services/` - Business logic layer for each domain
- `lib/` - Utilities (Prisma client, S3 client, etc.)
- `types/` - TypeScript type definitions
- `validations/` - Zod schemas for form validation
- `prisma/` - Database schema and migrations

### Authentication & Authorization
- Email-based authentication via NextAuth.js
- Role-based access control (Organization, Team, Admin)
- Middleware handles route protection and role-based redirects
- Sessions include user roles, organizationId, and teamId

### Database Schema
Key relationships:
- Users belong to Organizations and/or Teams (many-to-many)
- Organizations belong to Teams (many-to-one)
- FundingRequests belong to Organizations
- DonationAgreements link FundingRequests with signature tracking
- Transactions track financial transfers between Teams and Organizations

### Status Workflows
FundingRequest statuses:
- Submitted → Accepted → WaitingForSignature → Approved → FundsDisbursing → Completed
- Can be Rejected at any stage

### Code Conventions
- Follow existing Cursor rules in `.cursor/rules/nextjs.mdc`
- Use TypeScript with strict typing
- Implement early returns for better readability
- Use Tailwind classes exclusively for styling
- Descriptive naming with "handle" prefix for event functions
- Implement accessibility features on interactive elements
- Use const arrow functions over function declarations

### Email System
- Template-based emails using Handlebars
- Templates stored in `templates/` directory
- Email notifications for funding status changes, document uploads, reminders
- Team-specific email template management

### File Management
- AWS S3 integration for file storage
- Pre-signed URLs for secure uploads
- File type classification (tax certificates, reports, receipts, etc.)
- Automatic file association with organizations and funding requests

### Data rules
`docs/DATA_RULES.md` describes how funding requests and contacts may change (status path, payouts, agreements, contact visibility, edits, merge, e-mail uniqueness), where each rule lives and which test covers it. Keep it, the code and the tests in step.
`docs/FOLLOW_UPS.md` lists known open points (with why and how); check it before working in those areas, and remove an entry once it is done.

### Testing
Tests use Node's built-in test runner (`node:test`); there is no Jest/Vitest.

- `yarn test`: unit tests in `tests/*.test.ts` and `src/**/*.test.ts`. Routes and services are loaded with `tests/helpers/load-module.ts`, which requires every `@/` import to be mocked explicitly.
- `yarn test:db`: database tests in `tests/db/`, running real services against a real Postgres. They use `TEST_DATABASE_URL` only (never `DATABASE_URL`), refuse a database whose name lacks `test`, and empty all tables between tests.
- `yarn db:check`: applies all migrations to the test database and fails if the result differs from `prisma/schema.prisma`. Any schema change needs a matching migration.
- `yarn ci:verify` (lint, tests, typecheck) runs in the Dockerfile `test` stage, and `yarn ci:db` against a Postgres container, in `.gitea/workflows/docker-image.yml` on pushes to main and on pull requests.

Local database run:

```bash
docker run -d --rm --name crm-test-db -p 55432:5432 \
  -e POSTGRES_PASSWORD=pg -e POSTGRES_DB=crm_test postgres:16-alpine
TEST_DATABASE_URL=postgresql://postgres:pg@localhost:55432/crm_test yarn ci:db
```