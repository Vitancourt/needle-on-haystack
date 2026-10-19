import { defineConfig } from 'vite';

export default defineConfig({
  // Configurable so the same build works at "/" (Docker/nginx) and "/<repo>/" (GitHub Pages).
  base: process.env.VITE_BASE ?? '/',
  server: {
    host: true,
    port: 5173,
    // File events don't propagate through bind mounts on WSL2/Docker Desktop.
    watch: { usePolling: process.env.CHOKIDAR_USEPOLLING === 'true' },
  },
});
