import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  // API_PROXY lets the dev server talk to a backend on another port
  // (docker-compose.local.yml publishes it on 5001). Set it in ../.env.development.local.
  const env = loadEnv(mode, '..', '')
  const api = env.API_PROXY || process.env.API_PROXY || 'http://localhost:5000'
  return {
    plugins: [react(), tailwindcss()],
    envDir: '..',
    server: {
      proxy: {
        '/api': api,
        '/uploads': api,
        '/admin': api,
      },
    },
    build: {
      target: 'es2020',
      cssMinify: true,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-motion': ['framer-motion'],
            'vendor-icons': ['lucide-react'],
          },
        },
      },
    },
  }
})
