import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import solid from "vite-plugin-solid";

// Tests live in each package's `test/` directory, never colocated in `src/`:
// packages ship `src` to npm and `tsc -b` emits everything under `src` into
// `dist`, so a colocated test would be both published and compiled.
//
// Two projects, because the packages have genuinely different needs:
//   core  — pure math, no DOM. Node is fastest and sufficient.
//   solid — primitives that measure real layout. `createResize` uses
//           ResizeObserver and `el.clientWidth`; jsdom implements neither
//           (clientWidth is always 0), so a real browser is the only place
//           the measurement path can be honestly exercised.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "core",
          include: ["packages/core/test/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        plugins: [solid()],
        resolve: {
          // Match the playground: prefer the "solid" condition so we compile
          // the same TSX source a downstream consumer would.
          conditions: ["solid", "development", "browser"],
        },
        test: {
          name: "solid",
          include: ["packages/solid/test/**/*.test.{ts,tsx}"],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
