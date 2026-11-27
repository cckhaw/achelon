import { execSync } from "node:child_process";

/** Migrates the dedicated test database (owner role) once per run. */
export default function setup() {
  const owner = process.env.TEST_DATABASE_URL_OWNER ?? "postgresql://achelon:achelon@localhost:5432/achelon_test";
  execSync("npx tsx scripts/migrate.ts", {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL_OWNER: owner, APP_DB_PASSWORD: process.env.TEST_APP_DB_PASSWORD ?? "achelon_app" },
  });
}
