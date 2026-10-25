import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

function oneHtmlFile(): Plugin {
  return {
    name: 'one-html-file',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const htmlName = Object.keys(bundle).find((name) => name.endsWith('.html'))
      if (!htmlName) return
      const htmlAsset = bundle[htmlName]
      if (htmlAsset.type !== 'asset' || typeof htmlAsset.source !== 'string') return

      const css: string[] = []
      const js: string[] = []
      for (const file of Object.values(bundle)) {
        if (file.type === 'asset' && file.fileName.endsWith('.css')) css.push(String(file.source))
        if (file.type === 'chunk') js.push(file.code.replaceAll('__VITE_PRELOAD__', '[]'))
      }

      let html = htmlAsset.source
      html = html.replace(/<meta[^>]*Content-Security-Policy[^>]*>/i, '')
      html = html.replace(/<link[^>]*rel="stylesheet"[^>]*>/g, '')
      html = html.replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g, '')
      // A function replacement keeps `$` sequences in the bundle intact.
      html = html.replace('</head>', () => `<style>\n${css.join('\n')}\n</style>\n</head>`)
      html = html.replace('</body>', () => `<script type="module">\n${js.join('\n')}\n</script>\n</body>`)
      htmlAsset.source = html

      for (const name of Object.keys(bundle)) {
        if (name !== htmlName) delete bundle[name]
      }
    },
    closeBundle() {
      const built = resolve(__dirname, 'browser-dist/index.html')
      copyFileSync(built, resolve(__dirname, 'Verilumen.html'))
      copyFileSync(built, resolve(__dirname, 'docs/index.html'))
    }
  }
}

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } },
  plugins: [react(), oneHtmlFile()],
  build: {
    outDir: resolve(__dirname, 'browser-dist'),
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: {
      input: resolve(__dirname, 'src/renderer/index.html'),
      output: { inlineDynamicImports: true }
    }
  }
})
