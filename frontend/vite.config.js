import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const basePath = env.VITE_BASE_PATH || ''

  return {
    plugins: [react()],
    base: basePath ? `${basePath}/` : '/',
    resolve: {
      alias: {
        'react': path.resolve(__dirname, 'node_modules/react'),
        'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
      },
      dedupe: ['react', 'react-dom'],
    },
    server: {
      port: 5173,
      proxy: {
        // API 代理到 backend
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
        // MinIO 代理 - 本地开发时代理到本地 MinIO 或远程服务器
        '/minio': {
          target: 'http://localhost:9000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/minio/, ''),
        },
      },
    },
  }
})
