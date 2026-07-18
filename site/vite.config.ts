import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

// The site consumes the workspace packages' TSX SOURCE through each package's
// "solid" export condition, exactly as the playground does and exactly as a
// downstream consumer's app does. That is deliberate: the site is the public
// proof that the documented install path works, so it must not be built through
// a resolution path no consumer uses.
export default defineConfig({
  plugins: [solid()],
  // Relative, so the built site is servable from any path — a `*.pages.dev`
  // subdomain today, a custom domain later — without a rebuild. An absolute
  // base would hard-code today's hostname into every asset URL.
  base: "./",
  resolve: {
    conditions: ["source", "solid", "development", "browser"],
  },
  build: {
    outDir: "dist",
    // The site is the alpha's front door; a silently-oversized bundle is a
    // performance defect on the low-end reference target, not a warning.
    chunkSizeWarningLimit: 400,
  },
  server: {
    port: 5174,
  },
});
