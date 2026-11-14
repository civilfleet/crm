import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import ts from "typescript";
import * as types from "@/types";

/*
  Database tests run the real services against a real, migrated Postgres.

  They only ever use TEST_DATABASE_URL (never DATABASE_URL, which may point
  at a shared database), and refuse a database whose name lacks "test":
  every test starts by emptying all tables.

    docker run -d --rm --name crm-test-db -p 55432:5432 \
      -e POSTGRES_PASSWORD=pg -e POSTGRES_DB=crm_test postgres:16-alpine
    export TEST_DATABASE_URL=postgresql://postgres:pg@localhost:55432/crm_test
    yarn ci:db
*/

const resolveTestDatabaseUrl = () => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Database tests need their own database (see tests/db/helpers.ts).",
    );
  }
  const name = new URL(url).pathname.replace(/^\//, "");
  if (!name.includes("test")) {
    throw new Error(
      `Refusing to run database tests against "${name}": the database name must contain "test".`,
    );
  }
  return url;
};

const pool = new Pool({ connectionString: resolveTestDatabaseUrl(), max: 5 });

export const db = new PrismaClient({ adapter: new PrismaPg(pool) });

export const disconnect = async () => {
  await db.$disconnect();
  await pool.end();
};

/** Empties every table but the migration history. */
export const resetDatabase = async () => {
  const tables = await db.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'
  `;
  if (tables.length === 0) return;
  const list = tables.map(({ tablename }) => `"${tablename}"`).join(", ");
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
};

const noop = () => undefined;
const silentLogger = {
  __esModule: true,
  default: { info: noop, warn: noop, error: noop, debug: noop },
};

const root = process.cwd();
const requireFromRepo = createRequire(path.join(root, "package.json"));

const resolveSource = (base: string) => {
  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const candidate of [
    ...[".ts", ".tsx", ".js"].map((extension) => `${base}${extension}`),
    ...[".ts", ".tsx", ".js"].map((extension) =>
      path.join(base, `index${extension}`),
    ),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`Cannot resolve ${base}`);
};

/**
 * Loads a service module and, recursively, the real `@/` modules it
 * imports, with `@/lib/prisma` bound to the test database. Only the
 * boundaries in `mocks` (and the logger) are replaced; `next/*` must be
 * mocked explicitly, so no request context sneaks in.
 */
export const loadService = <T>(
  relative: string,
  mocks: Record<string, unknown> = {},
): T => {
  const boundaries: Record<string, unknown> = {
    "@/lib/prisma": { __esModule: true, default: db, prisma: db },
    "@/lib/logger": silentLogger,
    ...mocks,
  };
  const cache = new Map<string, { exports: unknown }>();

  const load = (file: string): unknown => {
    const cached = cache.get(file);
    if (cached) return cached.exports;
    const module = { exports: {} as unknown };
    cache.set(file, module);
    const code = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
      fileName: file,
    }).outputText;
    const require = (id: string) => {
      if (Object.hasOwn(boundaries, id)) return boundaries[id];
      if (id.startsWith("@/")) {
        return load(resolveSource(path.join(root, "src", id.slice(2))));
      }
      if (id.startsWith("./") || id.startsWith("../")) {
        return load(resolveSource(path.resolve(path.dirname(file), id)));
      }
      if (id.startsWith("next/") || id === "next") {
        throw new Error(`Missing test boundary: ${id} (from ${file})`);
      }
      return requireFromRepo(id);
    };
    new Function("require", "module", "exports", code)(
      require,
      module,
      module.exports,
    );
    return module.exports;
  };

  return load(path.join(root, relative)) as T;
};

let sequence = 0;
const unique = (prefix: string) => `${prefix}-${Date.now()}-${++sequence}`;

export const createUser = (name = "Signer") =>
  db.user.create({
    data: { name, email: `${unique("user")}@example.org` },
  });

/** A team, an organization of it, a submitter and a funding request. */
export const createFundingRequest = async ({
  amountAgreed,
  status = types.FundingStatus.Accepted,
}: {
  amountAgreed?: number;
  status?: types.FundingStatus;
} = {}) => {
  const team = await db.teams.create({
    data: { name: unique("Team"), email: `${unique("team")}@example.org` },
  });
  const organization = await db.organization.create({
    data: {
      name: unique("Organization"),
      email: `${unique("org")}@example.org`,
      teamId: team.id,
    },
  });
  const submitter = await createUser("Submitter");
  const fundingRequest = await db.fundingRequest.create({
    data: {
      name: "Rescue boat engine",
      description: "A new engine",
      purpose: "Safety",
      refinancingConcept: "Donations",
      sustainability: "Ten years of use",
      amountRequested: new Prisma.Decimal(amountAgreed ?? 1000),
      ...(amountAgreed === undefined
        ? {}
        : {
            amountAgreed: new Prisma.Decimal(amountAgreed),
            remainingAmount: new Prisma.Decimal(amountAgreed),
          }),
      expectedCompletionDate: new Date("2027-01-01T00:00:00Z"),
      status,
      organizationId: organization.id,
      teamId: team.id,
      submittedById: submitter.id,
    },
  });
  return { team, organization, submitter, fundingRequest };
};

export const decimal = (value: Prisma.Decimal.Value | null | undefined) =>
  value === null || value === undefined
    ? null
    : new Prisma.Decimal(value).toNumber();
