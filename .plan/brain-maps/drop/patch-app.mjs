import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync } from "node:fs";
const src = process.argv[2];
const drop = process.argv[3];
function patch(file, fn) {
  const full = `${src}/${file}`;
  if (!existsSync(`${full}.bak-helium-maps`)) copyFileSync(full, `${full}.bak-helium-maps`);
  const raw = readFileSync(`${full}.bak-helium-maps`, "utf8");
  const crlf = raw.includes("\r\n");
  let s = raw.replace(/\r\n/g, "\n");
  const rep = (a, b) => { if (!s.includes(a)) throw new Error(`${file}: Anker fehlt: ${a.slice(0, 90)}`); s = s.replace(a, b); };
  fn(rep);
  writeFileSync(full, crlf ? s.replace(/\n/g, "\r\n") : s, "utf8");
  console.log("ok", file);
}
function put(from, to) {
  const full = `${src}/${to}`;
  mkdirSync(full.split("/").slice(0, -1).join("/"), { recursive: true });
  if (existsSync(full) && !existsSync(`${full}.bak-helium-maps`)) copyFileSync(full, `${full}.bak-helium-maps`);
  copyFileSync(`${drop}/${from}`, full);
  console.log("neu", to);
}
put("maps-queries.ts", "lib/brain/maps.ts");
put("brain-maps-graph.tsx", "components/brain/maps/brain-maps-graph.tsx");
put("brain-maps-page.tsx", "components/brain/maps/brain-maps-page.tsx");
put("brain-route.tsx", "routes/_authed/_app/brain.tsx");

patch("components/companies/vault-note-editor.tsx", (rep) => {
  rep('import { IconCheck, IconLoader2 } from "@tabler/icons-react";', 'import { IconBrain, IconCheck, IconLoader2 } from "@tabler/icons-react";\nimport { useNavigate } from "@tanstack/react-router";');
  rep("  path,\n  onBack,\n}: {\n  path: string;\n  onBack?: () => void;\n}", "  path,\n  onBack,\n  companyId,\n}: {\n  path: string;\n  onBack?: () => void;\n  /** Firma, in deren Arbeitsbereich die Datei offen ist - fuer \"Im Brain zeigen\" und zurueck. */\n  companyId?: string;\n}");
  rep("  const queryClient = useQueryClient();\n  const file = useQuery(brainFileQueryOptions(path));", "  const queryClient = useQueryClient();\n  const navigate = useNavigate();\n  const file = useQuery(brainFileQueryOptions(path));");
  rep('{path.split("/").pop() ?? path}\n                  </span>', `{path.split("/").pop() ?? path}
                  </span>
                  <button
                    className="inline-flex items-center gap-1 rounded border border-neutral-200 px-2 py-0.5 text-[11px] font-medium text-neutral-500 transition hover:border-neutral-400 hover:text-neutral-900 dark:border-neutral-800 dark:text-neutral-400 dark:hover:text-white"
                    data-testid="show-in-brain"
                    onClick={() => void navigate({ to: "/brain", search: { focus: path, from: companyId } })}
                    title="Diese Datei im Brain-Graph zeigen (Rechte, Links, Bereich)"
                    type="button"
                  >
                    <IconBrain className="size-3" stroke={1.8} />
                    Im Brain zeigen
                  </button>`);
});

patch("components/companies/level3-site-studio.tsx", (rep) => {
  rep("<VaultNoteEditor onBack={() => setOpenVaultPath(companyId, null)} path={vaultPath} />", "<VaultNoteEditor companyId={companyId} onBack={() => setOpenVaultPath(companyId, null)} path={vaultPath} />");
});

patch("components/companies/level-chrome-sidebar.tsx", (rep) => {
  rep("  IconBrandChrome,", "  IconBrain,\n  IconBrandChrome,");
  rep("<IconSettings />\n                    Settings\n                  </DropdownMenuItem>", "<IconSettings />\n                    Settings\n                  </DropdownMenuItem>\n                  <DropdownMenuItem onClick={() => void navigate({ to: \"/brain\" })}>\n                    <IconBrain />\n                    Brain\n                  </DropdownMenuItem>");
});

patch("components/app-sidebar/app-sidebar.tsx", (rep) => {
  rep("  IconBuilding,", "  IconBrain,\n  IconBuilding,");
  rep('<IconBuildingStore className="size-4" />\n                  Market\n                </DropdownMenuItem>', '<IconBuildingStore className="size-4" />\n                  Market\n                </DropdownMenuItem>\n                <DropdownMenuItem\n                  className="gap-2 rounded-lg px-2.5 py-2"\n                  onClick={() => void navigate({ to: "/brain" })}\n                >\n                  <IconBrain className="size-4" />\n                  Brain\n                </DropdownMenuItem>');
});

patch("components/brain/brain-settings-page.tsx", (rep) => {
  rep('import { useQuery } from "@tanstack/react-query";', 'import { useQuery } from "@tanstack/react-query";\nimport { useNavigate } from "@tanstack/react-router";');
  rep("  const status = useQuery(brainStatusQueryOptions());", "  const status = useQuery(brainStatusQueryOptions());\n  const navigate = useNavigate();");
  rep("        <button\n          aria-expanded={locationOpen}", `        <div className="flex items-center gap-2">
        <button
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg bg-[#24231f] px-3 text-xs font-medium text-[#f6f5f2] transition-colors hover:bg-black"
          data-testid="open-brain-page"
          onClick={() => void navigate({ to: "/brain" })}
          type="button"
        >
          <IconBrain className="size-4" stroke={1.7} />
          Brain-Seite (Graph, Routinen, Braucht dich)
        </button>
        <button
          aria-expanded={locationOpen}`);
  rep("          Datenquelle\n        </button>", "          Datenquelle\n        </button>\n        </div>");
});
