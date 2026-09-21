import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

/** file:// 加载时去掉 crossorigin，避免模块脚本被 CORS 拦住。 */
function fileProtocolHtml() {
  return {
    name: 'file-protocol-html',
    transformIndexHtml(html: string) {
      return html.replace(/\s+crossorigin(="[^"]*")?/g, '')
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: 'index.cjs',
          inlineDynamicImports: true
        }
      }
    }
  },
  renderer: {
    base: './',
    resolve: {
      alias: {
        '@': resolve('src/renderer/src')
      }
    },
    plugins: [react(), fileProtocolHtml()],
    build: {
      modulePreload: false
    }
  }
})
