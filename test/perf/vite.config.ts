import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import solid from "vite-plugin-solid";

/**
 * Dev server for the performance workload page.
 *
 * The resolve conditions match the playground's and the visual fixture's
 * exactly, on purpose. A frame number is only about the shipped library if the
 * code being measured is the code a consumer's bundler compiles — "source" first
 * so workspace packages resolve to their TypeScript source rather than a stale
 * `dist`, then "solid" so the JSX compiled here is the JSX a Solid-aware
 * consumer compiles.
 *
 * `development` is in that list, and it is worth being explicit about what that
 * means for the numbers: this measures the DEV build, which is what the
 * playground and the visual baselines also measure, and it is the pessimistic
 * case. A production build strips Solid's development warnings and is faster. A
 * result recorded here is therefore a floor, not a ceiling — say so beside the
 * number rather than quietly claiming the better figure.
 */
export default defineConfig({
  root: fileURLToPath(new URL("./app", import.meta.url)),
  plugins: [solid()],
  resolve: {
    conditions: ["source", "solid", "development", "browser"],
  },
  server: {
    // Bind the loopback address the harness polls. Vite's default listens on
    // `localhost`, which can resolve to `::1` only — the readiness probe then
    // waits out its whole timeout against a server that started in 128ms. The
    // visual harness hit this first; it is recorded there too.
    host: "127.0.0.1",
    port: 5175,
    fs: {
      // The workload page imports package SOURCE and the frozen fixtures from
      // outside its own root.
      allow: [fileURLToPath(new URL("../..", import.meta.url))],
    },
  },
});
