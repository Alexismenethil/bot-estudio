import { describe, expect, it } from "vitest";
import { createTestPg } from "../helpers/pglite";

describe("Setup: PGlite + pgvector hermetic Postgres (T003)", () => {
  it("creates the vector extension, an HNSW index, and answers a cosine query", async () => {
    const pg = await createTestPg();
    await pg.exec("CREATE TABLE t (id serial primary key, embedding vector(3));");
    await pg.exec("INSERT INTO t (embedding) VALUES ('[1,2,3]'), ('[4,5,6]');");
    await pg.exec("CREATE INDEX ON t USING hnsw (embedding vector_cosine_ops);");

    const res = await pg.query<{ id: number }>(
      "SELECT id FROM t ORDER BY embedding <-> '[1,2,3]' LIMIT 1;",
    );

    expect(res.rows[0]?.id).toBe(1);
    await pg.close();
  });
});
