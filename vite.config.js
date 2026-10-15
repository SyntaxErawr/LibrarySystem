import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ command, mode, isPreview }) => {
  if (command === 'build' && !isPreview) {
    const value = loadEnv(mode, process.cwd(), 'VITE_').VITE_API_URL;
    if (!value) throw new Error('Set the public VITE_API_URL before building. Use your local backend /api URL for local preview or your HTTPS API URL for hosting.');
    let url;
    try { url = new URL(value); } catch { throw new Error('VITE_API_URL must be an absolute API URL.'); }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((!local && url.protocol !== 'https:') || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname.replace(/\/$/, '') !== '/api') throw new Error('VITE_API_URL must end in /api, use HTTPS when hosted, and contain no credentials or query string.');
    if (process.env.VERCEL && local) throw new Error('A hosted Vercel build requires an HTTPS VITE_API_URL; localhost is only for local preview.');
  }
  return {
  resolve: { dedupe: ['react', 'react-dom'] },
  plugins: [react(), tailwindcss()],
  };
});
