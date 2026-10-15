// import { defineConfig } from 'vite'
// import react from '@vitejs/plugin-react'

// export default defineConfig({
//   plugins: [react()],

//   server: {
//     host: '0.0.0.0',
//     port: 5173,

//     allowedHosts: [
//       'cup-makeup-covers-provision.trycloudflare.com'
//     ],

//     proxy: {
//       '/api': {
//         target: 'http://127.0.0.1:8765',
//         changeOrigin: true
//       },
//       '/health': {
//         target: 'http://127.0.0.1:8765',
//         changeOrigin: true
//       },
//       '/kartaview-api': {
//         target: 'https://api.openstreetcam.org',
//         changeOrigin: true,
//         secure: true,
//         followRedirects: true,
//         timeout: 15000,
//         proxyTimeout: 15000,
//         rewrite: (path) => path.replace(/^\/kartaview-api/, '')
//       },
//       '/kartaview-cdn': {
//         target: 'https://cdn.kartaview.org',
//         changeOrigin: true,
//         secure: true,
//         followRedirects: true,
//         timeout: 20000,
//         proxyTimeout: 20000,
//         rewrite: (path) => path.replace(/^\/kartaview-cdn/, '')
//       },
//       '/mapillary-api': {
//         target: 'https://graph.mapillary.com',
//         changeOrigin: true,
//         secure: true,
//         rewrite: (path) => path.replace(/^\/mapillary-api/, '')
//       }
//     }
//   }
// })
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  server: {
    host: '0.0.0.0',
    port: 5173,

    // Allow Cloudflare Quick Tunnel URLs.
    // Example:
    // https://xxxxx.trycloudflare.com
    allowedHosts: [
      '.trycloudflare.com'
    ],

    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8765',
        changeOrigin: true
      },

      '/health': {
        target: 'http://127.0.0.1:8765',
        changeOrigin: true
      },

      '/kartaview-api': {
        target: 'https://api.openstreetcam.org',
        changeOrigin: true,
        secure: true,
        followRedirects: true,
        timeout: 15000,
        proxyTimeout: 15000,
        rewrite: (path) => path.replace(/^\/kartaview-api/, '')
      },

      '/kartaview-cdn': {
        target: 'https://cdn.kartaview.org',
        changeOrigin: true,
        secure: true,
        followRedirects: true,
        timeout: 20000,
        proxyTimeout: 20000,
        rewrite: (path) => path.replace(/^\/kartaview-cdn/, '')
      },

      '/mapillary-api': {
        target: 'https://graph.mapillary.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/mapillary-api/, '')
      }
    }
  }
})