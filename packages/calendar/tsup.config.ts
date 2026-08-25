import { defineConfig } from "tsup";
import { solidPlugin } from "esbuild-plugin-solid";

// The publishable build for a bundler that knows nothing about Solid.
//
// Solid's JSX is not React's: it compiles to fine-grained reactive DOM
// operations, not to a `createElement` call tree. So this entry is compiled by
// Solid's own babel preset (`generate: "dom"`), never by esbuild's generic JSX
// transform — a generic transform produces markup that renders once and then
// never updates.
//
// This entry is deliberately NOT what a Solid-aware consumer gets. The "solid"
// export condition still resolves to `./src/index.tsx` so the consumer's own
// bundler compiles the JSX for its own target. See ADR-0006.
//
// `clean: true` is not a convenience — it is why a deleted source module cannot
// survive into the next tarball. `tsc -b` is incremental and never deletes,
// which is why its validation output goes to `.tsbuild` and never here.
// See ADR-0006.
export default defineConfig({
  entry: ["src/index.tsx"],
  outDir: "dist",
  format: ["esm"],
  dts: false, // see tsconfig.dist.json — tsup cannot emit types under TypeScript 7
  clean: true,
  sourcemap: true,
  target: "es2022",
  treeshake: true,
  esbuildPlugins: [solidPlugin({ solid: { generate: "dom" } })],
});
