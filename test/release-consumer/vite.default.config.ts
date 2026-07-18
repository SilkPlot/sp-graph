import { defineConfig } from "vite";
import { recordResolution } from "./record-resolution";

// Resolution path B. No Solid plugin, so nothing offers the "solid" condition and
// `@silkplot/*` resolves through "default" to the compiled ESM bundle.
//
// There is no JSX transform configured here of any kind. If a `@silkplot/*`
// package ever served TSX down this path, this build would fail on syntax it
// cannot parse — which is the failure a consumer would hit, reproduced here
// rather than described in a comment.
export default defineConfig({
  plugins: [recordResolution("resolution.default.json")],
  build: {
    outDir: "dist/default",
    emptyOutDir: true,
    rollupOptions: { input: "default.html" },
  },
});
