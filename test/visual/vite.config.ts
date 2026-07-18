import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import solid from "vite-plugin-solid";

/**
 * Dev server for the visual fixture page.
 *
 * The resolve conditions match the playground's exactly, on purpose. The
 * baselines must be pictures of the source a consumer's bundler compiles
 * through the "solid" export condition — not of a dist build, and not of a
 * private path that exists only for the screenshots. Keeping this identical to
 * the playground also means the fixtures cannot quietly start resolving
 * somewhere else while the playground still works.
 */
export default defineConfig({
  root: fileURLToPath(new URL("./app", import.meta.url)),
  plugins: [solid()],
  resolve: {
    // "source" first so every workspace package resolves to its TypeScript
    // source rather than a built `dist`; "solid" next so the JSX this page
    // compiles is the JSX a Solid-aware consumer compiles.
    conditions: ["source", "solid", "development", "browser"],
  },
  server: {
    // Bind the loopback address the harness polls. Vite's default listens on
    // `localhost`, which can resolve to `::1` only — the readiness probe then
    // waits out its whole timeout against a server that started in 128ms.
    host: "127.0.0.1",
    fs: {
      // The fixture page imports package SOURCE from outside its own root.
      allow: [fileURLToPath(new URL("../..", import.meta.url))],
    },
  },
});
