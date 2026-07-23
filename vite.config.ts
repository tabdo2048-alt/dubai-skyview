import { defineConfig, loadEnv } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";

export default defineConfig(async ({ command, mode }) => {
  // Expose VITE_* to import.meta.env for the SSR/nitro runtime too.
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const define: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) define[`import.meta.env.${k}`] = JSON.stringify(v);

  const plugins = [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      // src/server.ts wraps SSR error handling.
      server: { entry: "server" },
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
    }),
    viteReact(),
  ];

  // Nitro produces the deploy bundle (Cloudflare module) — build only.
  if (command === "build") {
    const { nitro } = await import("nitro/vite");
    plugins.splice(3, 0, nitro({ preset: "cloudflare-module" }));
  }

  return {
    define,
    // Lightning CSS in dev and build alike, so build-time CSS transforms
    // (e.g. -webkit-backdrop-filter handling) match the dev preview.
    css: { transformer: "lightningcss" as const },
    resolve: {
      alias: { "@": `${process.cwd()}/src` },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
    },
    plugins,
  };
});
