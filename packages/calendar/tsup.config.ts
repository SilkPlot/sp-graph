import { defineConfig } from "tsup";

// The publishable build. `dist` is what a bundler resolves through the "types"
// and "default" export conditions; `src` still ships beside it because the
// sourcemaps point back into it.
//
// `clean: true` is not a convenience — it is why a deleted source module cannot
// survive into the next tarball. `tsc -b` is incremental and never deletes,
// which is why its validation output goes to `.tsbuild` and never here.
// See ADR-0006.
export default defineConfig({
  entry: ["src/index.ts"],
  outDir: "dist",
  format: ["esm"],
  dts: false, // see tsconfig.dist.json — tsup cannot emit types under TypeScript 7
  clean: true,
  sourcemap: true,
  target: "es2022",
  treeshake: true,
});
