import { defineConfig } from 'vite';

export default defineConfig({
  // 포털은 사이트 루트(/)를 쓴다. 게임은 /play/, 엄빠는 /cafe/ 로 따로 서빙된다.
  base: '/',
  server: {
    host: true,
    port: 7102,
  },
  build: {
    target: 'es2020',
  },
});
