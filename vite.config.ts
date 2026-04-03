import {resolve} from "node:path";
import {defineConfig} from "vite";

export default defineConfig({
  root: resolve(__dirname, "dev"),
  resolve: {
    alias: {
      "@": resolve(__dirname, "src")
    }
  },
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
    minify: true,
    sourcemap:"inline",
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      formats: ["es"],
      fileName: () => "index.js"
    }
  }
});
