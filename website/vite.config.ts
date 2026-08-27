import path from "node:path";
import react from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { fumadocsMdx } from "fumadocs-mdx/vite";
import { nitro } from "nitro/vite";

const websiteRoot = import.meta.dirname;
const repoRoot = path.resolve(websiteRoot, "..");

export default defineConfig({
  server: {
    port: 3000,
    fs: {
      allow: [websiteRoot, repoRoot],
    },
  },
  plugins: [
    fumadocsMdx(),
    tailwindcss(),
    tanstackStart({
      prerender: {
        enabled: true,
      },
    }),
    react(),
    nitro({
      preset: "node-server",
    }),
  ],
  resolve: {
    tsconfigPaths: true,
    alias: {
      tslib: "tslib/tslib.es6.js",
      "@": path.join(websiteRoot, "src"),
    },
  },
});
