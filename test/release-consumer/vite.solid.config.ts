import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { recordResolution } from "./record-resolution";

// Resolution path A. `vite-plugin-solid` contributes the "solid" export
// condition, so `@silkplot/*` resolves to shipped TSX source and this build
// compiles the JSX itself.
//
// `resolve.conditions` is deliberately NOT set. Naming "solid" here would make
// the fixture assert its own premise: the condition has to arrive the way a real
// consumer gets it — from installing the Solid plugin — or the test proves only
// that Vite honours a list it was handed.
export default defineConfig({
  plugins: [solid(), recordResolution("resolution.solid.json")],
  build: {
    outDir: "dist/solid",
    emptyOutDir: true,
    rollupOptions: { input: "solid.html" },
  },
});
