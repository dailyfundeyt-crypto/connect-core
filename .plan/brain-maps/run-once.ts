// Fuehrt die drei Routinen einmal von Hand aus (wie Knopf "Jetzt laufen") und zeigt eine Dashboard-Zusammenfassung.
import { dashboard, readRoutines, runRoutine, worldOf } from "../../apps/server/src/brain/maps";
const root = process.argv[2];
const { routines, error } = await readRoutines(worldOf(root).core);
if (error) console.log("routines:", error);
for (const r of routines) console.log(r.name, await runRoutine(root, r, "hand"));
const d = await dashboard(root);
console.log(JSON.stringify({ prefix: d.corePrefix, hasMap: d.hasMap, areas: d.areas.map((a) => `${a.id}:${a.count}:${a.prefixes.join(",")}${a.missing.length ? " FEHLT " + a.missing.join(",") : ""}`), agents: d.agents.map((a) => `${a.slug}:${a.areas.length}`), needs: d.needs.length, agenda: [d.agenda.heute.length, d.agenda.naechste.length], lint: [d.lint.scanned, d.lint.brokenTotal, d.lint.folders.length] }, null, 1));
