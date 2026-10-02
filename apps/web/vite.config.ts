import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Collab Code Platform",
        short_name: "Collab",
        description: "Совместное редактирование кода, документов и досок в реальном времени",
        lang: "ru",
        display: "standalone",
        start_url: "/",
        theme_color: "#0f172a",
        background_color: "#f8fafc",
        icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
      },
      workbox: {
        // The app shell (including the Monaco editor and its workers) is precached so the
        // app opens without a network; API and WebSocket traffic is never cached here.
        globPatterns: ["**/*.{js,css,html,svg,woff2,ttf}"],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: "/index.html",
      },
    }),
  ],
  server: {
    port: 5173,
  },
});
