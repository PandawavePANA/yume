import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Separate production build config for the Reamer marketing site only.
// It shares this repo/package.json with Yume but is deployed as its own
// Railway service, so it needs its own entry (reamer.html), its own output
// directory (so it never collides with Yume's `dist/`), and none of
// Yume's server proxy config.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    outDir: "dist-reamer",
    rollupOptions: {
      input: fileURLToPath(new URL("./reamer.html", import.meta.url)),
    },
  },
});
