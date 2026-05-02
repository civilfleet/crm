import { PrismaClient, Roles } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import logger from "../lib/logger";

const bootstrapAdminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim();
const bootstrapAdminName = process.env.BOOTSTRAP_ADMIN_NAME?.trim();

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

async function main() {
  if (!bootstrapAdminEmail) {
    logger.info("BOOTSTRAP_ADMIN_EMAIL is not set; skipping admin bootstrap");
    return;
  }

  if (!isValidEmail(bootstrapAdminEmail)) {
    throw new Error("BOOTSTRAP_ADMIN_EMAIL must be a valid email address");
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PG_SSL_ROOT_CERT
      ? {
          rejectUnauthorized: true,
          ca: process.env.PG_SSL_ROOT_CERT.replace(/\\n/g, "\n"),
        }
      : undefined,
  });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const existingUser = await prisma.user.findUnique({
      where: {
        email: bootstrapAdminEmail,
      },
      select: {
        id: true,
        roles: true,
      },
    });

    if (existingUser) {
      const roles = Array.from(
        new Set<Roles>([...existingUser.roles, Roles.Admin]),
      );

      await prisma.user.update({
        where: {
          id: existingUser.id,
        },
        data: {
          roles,
          ...(bootstrapAdminName ? { name: bootstrapAdminName } : {}),
        },
      });

      logger.info(
        { email: bootstrapAdminEmail },
        "Ensured existing user has Admin role",
      );
      return;
    }

    await prisma.user.create({
      data: {
        email: bootstrapAdminEmail,
        name: bootstrapAdminName || null,
        roles: [Roles.Admin],
      },
    });

    logger.info({ email: bootstrapAdminEmail }, "Created bootstrap admin user");
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  logger.error({ error }, "Admin bootstrap failed");
  process.exitCode = 1;
});
