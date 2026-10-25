// 스모크 테스트: TV/폰 접속 → 폰 좌표가 TV로 릴레이되는지 검증
import WebSocket from 'ws';

const room = 'SMOKE1';
const base = 'ws://localhost:7180';

const tv = new WebSocket(`${base}/ws?role=tv&room=${room}`);
const results = { welcome: 0, joined: 0, point: false, fill: false };

tv.on('message', (d) => {
  const m = JSON.parse(String(d));
  if (m.type === 'welcome') results.welcome++;
  if (m.type === 'peer-joined' && m.role === 'phone') results.joined++;
  if (m.type === 'point') {
    results.point = true;
    console.log(`[TV 수신] point x=${m.x} y=${m.y}`);
    finish();
  }
  if (m.type === 'fill') {
    results.fill = true;
    console.log(`[TV 수신] fill color=${m.color}`);
    finish();
  }
});

tv.on('open', () => {
  console.log('[TV] 연결됨');
  const phone = new WebSocket(`${base}/ws?role=phone&room=${room}`);
  phone.on('open', () => {
    console.log('[PHONE] 연결됨');
    setTimeout(() => {
      phone.send(JSON.stringify({ type: 'point', x: 0.42, y: 0.31, pinch: false }));
      phone.send(JSON.stringify({ type: 'fill', x: 0.5, y: 0.5, color: '#457b9d' }));
    }, 300);
  });
});

let finished = false;
function finish() {
  if (finished) return;
  finished = true;
  setTimeout(() => {
    const pass = results.welcome >= 1 && results.joined >= 1 && results.point && results.fill;
    console.log('--- 결과 ---');
    console.log(JSON.stringify(results));
    console.log(pass ? '스모크 테스트 통과' : '스모크 테스트 실패');
    process.exit(pass ? 0 : 1);
  }, 400);
}

setTimeout(() => finish(), 5000);
