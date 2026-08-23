import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5174,
    // 스마트폰에서 https 없이 카메라를 쓰려면 LAN 내 https 프록시 또는
    // Chrome flag(unsafely-treat-insecure-origin-as-secure) 설정이 필요하다.
    // 개발 편의를 위해 기본 http 로 두고 README 에 안내한다.
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
  },
});
