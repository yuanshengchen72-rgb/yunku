import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "mysql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.MYSQL_URL ?? "mysql://root:password@127.0.0.1:3306/dianchao_distribution"
  }
});
