import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import solid from "vite-plugin-solid";
import { COVERAGE_FLOORS } from "./scripts/coverage-floors.mjs";

// Tests live in each package's `test/` directory, never colocated in `src/`:
// packages ship `src` to npm and `tsc -b` emits everything under `src` into
// `dist`, so a colocated test would be both published and compiled.
//
// `core` is pure math with no DOM, so node is fastest and sufficient. Anything
// rendering Solid runs in a real browser: `createResize` uses ResizeObserver and
// `el.clientWidth`, and jsdom implements neither (clientWidth is always 0), so a
// real browser is the only place that path can be honestly exercised.
const browserProjectIn = (name: string, root: string) => ({
  plugins: [solid()],
  resolve: {
    // Match the playground: "source" first so every workspace package resolves
    // to its TypeScript source rather than a built `dist`, then "solid" so the
    // TSX a Solid-aware consumer gets is the TSX these tests compile.
    conditions: ["source", "solid", "development", "browser"],
  },
  test: {
    name,
    include: [`${root}/test/**/*.test.{ts,tsx}`],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: "chromium" }],
    },
  },
});

const browserProject = (name: string, dir: string) =>
  browserProjectIn(name, `packages/${dir}`);

export default defineConfig({
  test: {
    // Coverage now gates, PER PACKAGE. The floors and the observed numbers each
    // was chosen from live in scripts/coverage-floors.mjs — one source of truth,
    // imported rather than restated, so the rationale cannot drift away from the
    // numbers it explains.
    //
    // Per-package globs and no repository-wide threshold, on purpose: a single
    // aggregate is where a stub hides. Four well-tested packages will carry an
    // untested one past any global number and report it as health.
    coverage: {
      provider: "v8",
      // `lcov` is here for the Codacy upload in CI and nothing else — it writes
      // `coverage/lcov.info`, the only format the coverage reporter reads. The
      // other three are for humans and for the floors gate; none of them is a
      // format Codacy can parse, so without this the upload step would have
      // nothing to send.
      reporter: ["text", "html", "json-summary", "lcov"],
      include: ["packages/*/src/**/*.{ts,tsx}"],
      // Barrel files re-export and hold no logic of their own; counting them
      // measures the export list, not the code.
      exclude: ["packages/*/src/index.{ts,tsx}"],
      thresholds: COVERAGE_FLOORS,
    },
    projects: [
      {
        test: {
          name: "core",
          include: ["packages/core/test/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        // `theme` emits CSS as strings and reads no DOM, so node is sufficient
        // and fastest — the same reasoning that keeps `core` out of a browser.
        test: {
          name: "theme",
          include: ["packages/theme/test/**/*.test.ts"],
          environment: "node",
        },
      },
      browserProject("solid", "solid"),
      browserProject("charts", "charts"),
      // The playground is where the reference interaction surface lives, so it
      // is where the visible-focus contract can be proven end to end — on the
      // element that actually removed its own outline, with the real stylesheet
      // applied. A focus ring is a computed style under `:focus-visible` and a
      // media query, none of which a node environment resolves.
      browserProjectIn("playground", "playground"),
    ],
  },
});
