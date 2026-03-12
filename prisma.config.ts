import 'dotenv/config'
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // `prisma generate` does not require a live database URL.
    url: process.env.DATABASE_URL ?? "",
  },
});
