import { defineConfig } from "vitest/config";

// Tests live in each package's `test/` directory, never colocated in `src/`:
// packages ship `src` to npm and `tsc -b` emits everything under `src` into
// `dist`, so a colocated test would be both published and compiled.
export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    environment: "node",
  },
});
