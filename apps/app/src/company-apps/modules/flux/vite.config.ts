import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: { "@flux": path.resolve(projectRoot, "source") },
  },
  plugins: [
    tailwindcss(),
    tanstackStart({ srcDirectory: "source" }),
    react(),
    nitro(),
  ],
});
