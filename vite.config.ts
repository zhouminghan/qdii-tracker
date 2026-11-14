import { createReadStream, existsSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

const projectRoot = import.meta.dirname
const dataRoot = path.resolve(projectRoot, 'web/data')

function servePublicData(
  request: IncomingMessage,
  response: ServerResponse,
  next: (error?: unknown) => void,
): void {
  const relative = decodeURIComponent((request.url ?? '').split('?')[0].replace(/^\/+/, ''))
  const filePath = path.resolve(dataRoot, relative)
  if (!filePath.startsWith(`${dataRoot}${path.sep}`) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    next()
    return
  }
  const extension = path.extname(filePath)
  const contentType = extension === '.json'
    ? 'application/json; charset=utf-8'
    : extension === '.rss'
      ? 'application/rss+xml; charset=utf-8'
      : 'application/octet-stream'
  response.setHeader('Content-Type', contentType)
  response.setHeader('Cache-Control', 'no-cache')
  createReadStream(filePath).pipe(response)
}

export default defineConfig({
  root: 'frontend',
  base: './',
  plugins: [
    vue(),
    {
      name: 'qdii-public-data',
      configureServer(server) {
        server.middlewares.use('/data', servePublicData)
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'frontend/src'),
    },
  },
  build: {
    outDir: path.resolve(import.meta.dirname, 'web'),
    emptyOutDir: false,
    sourcemap: true,
    target: 'es2022',
  },
  server: {
    host: '127.0.0.1',
    port: 8765,
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['../test/frontend/**/*.spec.ts'],
    setupFiles: ['../test/frontend/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,vue}'],
    },
  },
})
