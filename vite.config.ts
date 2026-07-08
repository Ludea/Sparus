import { defineConfig, type PluginOption } from "vite-plus";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  define: {
    process: { env: {} },
  },
  plugins: [...react()] as PluginOption[],
  resolve: {
    tsconfigPaths: true,
  },
  fmt: {
    ignorePatterns: ["dist/**", "src-tauri"],
  },
  lint: {
    ignorePatterns: ["dist/**", "src-tauri"],
    options: {
      denyWarnings: true,
      typeAware: true,
      typeCheck: true,
    },
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
