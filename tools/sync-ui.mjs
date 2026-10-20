// packages/ui/tokens.css 를 정적 앱(apps/cafe)이 서빙하는 위치로 복사한다.
//   node tools/sync-ui.mjs          복사해서 갱신
//   node tools/sync-ui.mjs --check  복사본이 원본과 다르면 실패(빌드 게이트)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, 'packages/ui/tokens.css');
const dst = resolve(root, 'apps/cafe/public/kids-tokens.css');
const header = '/* 생성물: packages/ui/tokens.css 의 복사본. `npm run sync-ui -w @ht/cafe`로 갱신하고 직접 고치지 않는다. */\n';
const want = header + readFileSync(src, 'utf8');

if (process.argv.includes('--check')) {
  let have = '';
  try { have = readFileSync(dst, 'utf8'); } catch { /* 없으면 불일치 */ }
  if (have !== want) {
    console.error('[sync-ui] apps/cafe/public/kids-tokens.css 가 packages/ui/tokens.css 와 다릅니다. `npm run sync-ui -w @ht/cafe` 실행 후 커밋하세요.');
    process.exit(1);
  }
  console.log('[sync-ui] 토큰 복사본이 최신입니다.');
} else {
  writeFileSync(dst, want);
  console.log('[sync-ui] 복사 완료:', dst);
}
