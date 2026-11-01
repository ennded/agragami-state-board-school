import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // Built straight into server/dist so a host that only deploys the
    // "server" folder (e.g. Hostinger's Node.js app root setting) still
    // gets the built website alongside the server that serves it.
    outDir: "server/dist",
    emptyOutDir: true,
  },
  server: {
    // While developing, pass API calls and uploaded files on to the backend.
    proxy: {
      "/api": "http://localhost:5000",
      "/uploads": "http://localhost:5000",
    },
  },
});
