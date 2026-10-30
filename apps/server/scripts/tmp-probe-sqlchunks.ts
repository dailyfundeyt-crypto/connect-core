import { sql } from "drizzle-orm";

const ids = ["a", "b"];
const q = sql`SELECT id FROM agents WHERE id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`;
const chunks = (q as any).queryChunks ?? [];
console.log(
  chunks.map((c: any) => ({
    ctor: c?.constructor?.name,
    value: Array.isArray(c?.value) ? c.value : c?.value,
    isArr: Array.isArray(c?.value),
    nested: c?.queryChunks ? c.queryChunks.length : undefined,
  })),
);
