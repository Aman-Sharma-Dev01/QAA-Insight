import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    // Multi-page app: landing.html at root, React app at /app/
    root: '.',
    build: {
      rollupOptions: {
        input: {
          landing: path.resolve(__dirname, 'landing.html'),
          app: path.resolve(__dirname, 'index.html'),
        }
      }
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      // Serve landing.html at / by default
      open: '/landing.html',
    },
    plugins: [
      react(),
      // Redirect / → /landing.html in dev server
      {
        name: 'redirect-root-to-landing',
        configureServer(server: any) {
          server.middlewares.use((req: any, _res: any, next: any) => {
            if (req.url === '/') {
              req.url = '/landing.html';
            }
            next();
          });
        },
      },
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
