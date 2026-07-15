import { defineConfig } from "vite";

export default defineConfig({
  // 정적 에셋(KayKit glb)이 src/public 아래에 있으므로 publicDir를 지정.
  //  → src/public/assets/foo.glb 는 런타임에 /assets/foo.glb 로 서빙됨.
  publicDir: "src/public",
  server: {
    port: 5173,
    open: true,
  },
  build: {
    target: "es2020",
  },
});
