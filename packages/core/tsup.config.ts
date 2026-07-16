import { defineConfig } from "tsup";

// Publishable dist build (a documented follow-up — not required to consume the
// source-shipping "solid" export). Emits ESM + type declarations.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2022",
  treeshake: true,
});
