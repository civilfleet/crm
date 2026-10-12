import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Roles } from "@prisma/client";
import { Pool } from "pg";
import { resolveBootstrapAdminEmails } from "@/config/bootstrap-admin";
import logger from "@/lib/logger";

const bootstrapAdminEmails = resolveBootstrapAdminEmails({
  BOOTSTRAP_ADMIN_EMAIL: process.env.BOOTSTRAP_ADMIN_EMAIL,
  BOOTSTRAP_ADMIN_EMAILS: process.env.BOOTSTRAP_ADMIN_EMAILS,
});
const bootstrapAdminName = process.env.BOOTSTRAP_ADMIN_NAME?.trim();

async function main() {
  if (bootstrapAdminEmails.length === 0) {
    logger.info(
      "BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_EMAILS are not set; skipping admin bootstrap",
    );
    return;
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
    for (const bootstrapAdminEmail of bootstrapAdminEmails) {
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
            ...(bootstrapAdminEmails.length === 1 && bootstrapAdminName
              ? { name: bootstrapAdminName }
              : {}),
          },
        });

        logger.info(
          { email: bootstrapAdminEmail },
          "Ensured existing user has Admin role",
        );
        continue;
      }

      await prisma.user.create({
        data: {
          email: bootstrapAdminEmail,
          name:
            bootstrapAdminEmails.length === 1
              ? bootstrapAdminName || null
              : null,
          roles: [Roles.Admin],
        },
      });

      logger.info(
        { email: bootstrapAdminEmail },
        "Created bootstrap admin user",
      );
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  logger.error({ error }, "Admin bootstrap failed");
  process.exitCode = 1;
});
