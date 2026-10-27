import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon-192.png", "icon-512.png"],
      manifest: {
        name: "AccessiTour 액세시투어",
        short_name: "AccessiTour",
        description: "Find a tour guide in Korea that fits how you travel.",
        lang: "en",
        start_url: "/",
        scope: "/",
        display: "standalone",
        theme_color: "#1f5fa8",
        background_color: "#f6f8fa",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      // Only the app shell is cached. API calls (/match) always go to the network.
      workbox: { navigateFallback: "/index.html" },
    }),
  ],
  server: { port: 5173 },
});
