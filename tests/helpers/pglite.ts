import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/lib/db/schema";

// Hermetic, in-process Postgres for integration tests (plan.md Testing line;
// no live Neon needed). pgvector ships as a separate extension package
// (@electric-sql/pglite-pgvector) — verified against @electric-sql/pglite
// 0.5.4 to support `CREATE INDEX ... USING hnsw`, so the HNSW index migration
// used in production (data-model.md) runs unmodified here too.
export async function createTestPg() {
  const client = new PGlite({ extensions: { vector } });
  await client.exec("CREATE EXTENSION IF NOT EXISTS vector;");
  return client;
}

// Same schema + real migration files as production, applied against the
// hermetic PGlite instance — keeps integration tests in sync with
// drizzle/*.sql by construction instead of hand-duplicating DDL.
export async function createTestDb() {
  const client = await createTestPg();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return { client, db };
}
