import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "npm run build && node dist/prisma/seed.js",
  },
  datasource: {
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
  },
});
