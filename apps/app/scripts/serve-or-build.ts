import { cp, mkdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isReusableBuild,
  writeBuildCacheManifest,
  type BuildCachePaths,
} from "./build-cache";

type RunCommand = (command: string[], cwd: string) => Promise<void>;

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultAppDir = resolve(scriptDir, "..");
const defaultRootDir = resolve(defaultAppDir, "..");

/*
 * Mirror the freshly built app into the bundled desktop runtime.
 *
 * The Connect desktop browser (apps/connect-app/runtime/connect/apps/app/dist/)
 * is the surface the user actually loads when they launch Connect.exe — it
 * does not read apps/app/dist at runtime. Without this mirror every change
 * would land in the dev dist while the running app keeps serving the stale
 * bundle, which is exactly how the "stuck on the loading screen" regression
 * slipped in.
 *
 * Skipped silently when the desktop runtime is not present in this checkout,
 * so the same script stays usable in pure-app development worktrees.
 */
async function mirrorAppDistToDesktopRuntime(paths: BuildCachePaths) {
  const candidate = resolve(
    paths.rootDir,
    "connect-app",
    "runtime",
    "connect",
    "apps",
    "app",
    "dist",
  );
  let info: Awaited<ReturnType<typeof stat>>;
  try {
    info = await stat(candidate);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  if (!info.isDirectory()) return;
  await mkdir(candidate, { recursive: true });
  await cp(join(paths.appDir, "dist", "index.html"), join(candidate, "index.html"));
  await cp(join(paths.appDir, "dist", "assets"), join(candidate, "assets"), { recursive: true });
  console.log(`Mirrored app/dist -> ${candidate}`);
}

function pathsFromEnvironment(): BuildCachePaths {
  return {
    rootDir: process.env.CONNECT_BUILD_CACHE_ROOT_DIR
      ? resolve(process.env.CONNECT_BUILD_CACHE_ROOT_DIR)
      : defaultRootDir,
    appDir: process.env.CONNECT_BUILD_CACHE_APP_DIR
      ? resolve(process.env.CONNECT_BUILD_CACHE_APP_DIR)
      : defaultAppDir,
  };
}

async function run(command: string[], cwd: string) {
  const child = Bun.spawn({
    cmd: command,
    cwd,
    env: process.env,
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await child.exited;
  if (exitCode !== 0) {
    throw new Error(`${command.join(" ")} exited with ${exitCode}`);
  }
}

export async function prepareProductionBuild(
  paths: BuildCachePaths,
  runCommand: RunCommand = run,
): Promise<"reused" | "rebuilt"> {
  await runCommand(
    [process.execPath, "run", "--cwd", paths.rootDir, "generate:app-config"],
    paths.rootDir,
  );

  if (await isReusableBuild(paths, process.env)) {
    console.log("Reusing app/dist from build cache");
    return "reused";
  }

  console.log("Building app/dist because the build cache is stale or missing");
  await runCommand(
    [
      process.execPath,
      "--bun",
      join("node_modules", "vite", "bin", "vite.js"),
    "build",
    ],
    paths.appDir,
  );
  await writeBuildCacheManifest(paths, process.env);
  await mirrorAppDistToDesktopRuntime(paths);
  return "rebuilt";
}

if (import.meta.main) {
  await prepareProductionBuild(pathsFromEnvironment());
}
