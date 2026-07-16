import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
// The playground consumes the workspace packages' TSX SOURCE directly (via each
// package's "solid" export condition). vite-plugin-solid compiles that JSX —
// which is exactly how a downstream SilkPlot consumer's app is set up.
export default defineConfig({
    plugins: [solid()],
    resolve: {
        // Prefer the "solid" export condition so we get the raw source, not a dist build.
        conditions: ["solid", "development", "browser"],
    },
    server: {
        port: 5173,
        open: true,
    },
});
//# sourceMappingURL=vite.config.js.map