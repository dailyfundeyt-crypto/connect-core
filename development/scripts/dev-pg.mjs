import EmbeddedPostgres from "embedded-postgres";

const pg = new EmbeddedPostgres({
  databaseDir: "./.pg-data",
  user: "openbot",
  password: "openbot",
  port: 5432,
  persistent: true,
});

console.log("[pg-here] initializing...");
await pg.initialise();
console.log("[pg-here] starting...");
await pg.start();
console.log("[pg-here] creating db...");
try {
  await pg.createDatabase("openbot");
  console.log("[pg-here] db 'openbot' ensured");
} catch (e) {
  console.log("[pg-here] db create (likely exists):", e.message);
}
console.log("[pg-here] READY on port 5432");

// Keep alive
process.on("SIGINT", async () => {
  console.log("[pg-here] stopping...");
  await pg.stop();
  process.exit(0);
});
setInterval(() => {}, 1 << 30);
