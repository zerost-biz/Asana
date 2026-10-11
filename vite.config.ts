/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const FAVICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#5b5bd6"/><path d="M9 21.5V10.5M9 10.5h9.5a3.5 3.5 0 0 1 0 7H9" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="22.5" cy="22" r="2.2" fill="#fff"/></svg>'

/**
 * 出力された JS / CSS を index.html に埋め込み、単一 HTML ファイルにする（--mode single 用）。
 * 追加の依存なしで、ダブルクリックで開く・チャットや iframe のプレビューに載せる用途に使える。
 */
function inlineAssets(): Plugin {
  return {
    name: 'inline-assets',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const htmlKey = Object.keys(bundle).find((k) => k.endsWith('.html'))
      if (!htmlKey) return
      const html = bundle[htmlKey]
      if (html.type !== 'asset') return
      let source = String(html.source)

      for (const [key, file] of Object.entries(bundle)) {
        const name = key.split('/').pop()!
        if (file.type === 'chunk' && key.endsWith('.js')) {
          const re = new RegExp(`<script[^>]*src="[^"]*${name}"[^>]*></script>`)
          const code = file.code.replace(/<\/script/gi, '<\\/script')
          source = source.replace(re, () => `<script type="module">${code}</script>`)
          delete bundle[key]
        } else if (file.type === 'asset' && key.endsWith('.css')) {
          const re = new RegExp(`<link[^>]*href="[^"]*${name}"[^>]*>`)
          source = source.replace(re, () => `<style>${String(file.source)}</style>`)
          delete bundle[key]
        }
      }
      // ファビコンも埋め込み（file:// で外部参照が 404 にならないように）
      source = source.replace('href="/favicon.svg"', `href="data:image/svg+xml,${encodeURIComponent(FAVICON)}"`)
      html.source = source
    },
  }
}

// `npm run build:single` : dist-single/index.html（単一ファイル）を出力する
export default defineConfig(({ mode }) => {
  const single = mode === 'single'
  return {
    plugins: [react(), ...(single ? [inlineAssets()] : [])],
    server: { port: 5173 },
    build: single ? { outDir: 'dist-single', assetsInlineLimit: 100_000_000, cssCodeSplit: false, chunkSizeWarningLimit: 2000 } : { chunkSizeWarningLimit: 900 },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  }
})
