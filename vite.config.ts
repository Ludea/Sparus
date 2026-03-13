import { defineConfig } from "vite-plus";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";

const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), svgr()],
  resolve: {
    tsconfigPaths: true,
  },
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: host ?? false,
    hmr: host
      ? {
          protocol: "ws",
          host: host,
          port: 5173,
        }
      : undefined,
    watch: {
      // 3. tell vite to ignore watching `src-tauri``
      ignored: ["**/src-tauri/**"],
    },
  },
});
