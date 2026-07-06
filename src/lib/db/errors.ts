// Postgres SQLSTATE 23505 = unique_violation. Surfaces identically from
// @neondatabase/serverless (production) and PGlite (tests) since both
// report real Postgres error codes.
export function isUniqueViolation(error: unknown): boolean {
  return (error as { cause?: { code?: string } })?.cause?.code === "23505";
}
