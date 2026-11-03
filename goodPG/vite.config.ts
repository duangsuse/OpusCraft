import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';

// WRANGLER_CONFIG elige otra configuración del Worker (p. ej. wrangler.vps.jsonc para open-compute en un VPS).
const configPath = process.env.WRANGLER_CONFIG;

export default defineConfig({
  plugins: [cloudflare(configPath ? { configPath } : {})],
  // Rutas relativas: el build se puede servir desde un subdirectorio (p. ej. /goodPG/dist/) o incluso
  // abrirse con file://; los módulos del cliente se resuelven solos. El Worker sigue usando /api/*.
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      // Nombres estables (sin hash) para que index.html pueda cargar el build por una ruta fija cuando se
      // sirve como carpeta estática (ver el cargador de reserva al final de index.html).
      output: { entryFileNames: 'assets/[name].js', chunkFileNames: 'assets/[name].js', assetFileNames: 'assets/[name][extname]' },
    },
  },
  worker: {
    format: 'es',
  },
});
