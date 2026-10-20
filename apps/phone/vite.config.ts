import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // 포털(/)이 루트를 쓰므로 게임은 /play/ 아래에서 서빙한다. 콘텐츠(/manifest.json, /artworks)·릴레이(/ws)는 루트 경로 그대로다.
  base: '/play/',
  plugins: [react()],
  server: {
    host: true,
    port: 7101,
    // 스마트폰에서 https 없이 카메라를 쓰려면 LAN 내 https 프록시 또는
    // Chrome flag(unsafely-treat-insecure-origin-as-secure) 설정이 필요하다.
    // 개발 편의를 위해 기본 http 로 두고 README 에 안내한다.
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
  },
});
