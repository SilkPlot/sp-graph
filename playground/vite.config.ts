import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

// The playground consumes the workspace packages' TSX SOURCE directly (via each
// package's "solid" export condition). vite-plugin-solid compiles that JSX —
// which is exactly how a downstream SilkPlot consumer's app is set up.
export default defineConfig({
  plugins: [solid()],
  resolve: {
    // "source" first so every workspace package resolves to its TypeScript
    // source rather than a built `dist`; "solid" next so the JSX this app
    // compiles is the JSX a Solid-aware consumer compiles.
    conditions: ["source", "solid", "development", "browser"],
  },
  server: {
    port: 5173,
    open: true,
  },
});
