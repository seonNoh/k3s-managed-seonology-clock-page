import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, cpSync, existsSync } from 'fs';

// manifest와 public 자산을 dist로 복사하는 소형 플러그인
function copyStatic() {
  return {
    name: 'copy-static',
    closeBundle() {
      mkdirSync('dist', { recursive: true });
      copyFileSync('manifest.json', 'dist/manifest.json');
      if (existsSync('public')) {
        cpSync('public', 'dist', { recursive: true }); // icons, fonts
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), copyStatic()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup.html'),
        newtab: resolve(__dirname, 'newtab.html'),
        // result: resolve(__dirname, 'result.html'),  // 선택
        'service-worker': resolve(__dirname, 'src/background/service-worker.js'),
      },
      output: {
        // service worker는 청크 분할되면 안 됨 → 엔트리 파일명 고정
        entryFileNames: (chunk) =>
          chunk.name === 'service-worker' ? 'service-worker.js' : 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
});
