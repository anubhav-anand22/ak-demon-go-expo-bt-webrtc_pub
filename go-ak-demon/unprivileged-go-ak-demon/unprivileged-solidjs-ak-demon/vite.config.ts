import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";
import devtools from "solid-devtools/vite";

export default defineConfig({
  plugins: [devtools(), solidPlugin()],
  server: {
    port: 3000,
    strictPort: true,
    hmr: {
      clientPort: 3000,
    },
  },
  build: {
    target: "esnext",
    outDir: "../pub/front/",
    emptyOutDir: true,
  },
  base: "/pub/front/",
});
