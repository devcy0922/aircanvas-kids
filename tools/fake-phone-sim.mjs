#!/usr/bin/env node
/**
 * 가짜 폰 시뮬레이터 — 서버 릴레이 동작 검증용.
 *
 * 사용:
 *   node tools/fake-phone-sim.mjs [roomCode] [--rate 30] [--lissajous]
 *
 * TV 앱을 띄워 같은 방 코드로 접속하면, 이 스크립트가 보내는 좌표가
 * TV 커서를 리사주 곡선으로 움직이는 것을 확인할 수 있다.
 */
import WebSocket from 'ws';

const args = process.argv.slice(2);
const room = (args[0] && !args[0].startsWith('--') ? args[0] : 'DEMO01').toUpperCase();
const rateOpt = args.indexOf('--rate');
const rate = rateOpt > -1 ? Number(args[rateOpt + 1]) : 30;
const lissajous = args.includes('--lissajous');

const url = `ws://localhost:8080/ws?role=phone&room=${room}&name=simulator`;
console.log(`[sim] ${url} 접속 시도…`);

const ws = new WebSocket(url);
let t = 0;

ws.on('open', () => {
  console.log(`[sim] 연결됨 — room=${room}, ${rate}Hz 로 좌표 전송 시작 (Ctrl+C 종료)`);
  setInterval(() => {
    t += 1 / rate;
    let x;
    let y;
    if (lissajous) {
      x = 0.5 + 0.36 * Math.sin(t * 2.0);
      y = 0.5 + 0.34 * Math.sin(t * 3.0 + Math.PI / 3);
    } else {
      // 원형 궤적
      x = 0.5 + 0.38 * Math.cos(t);
      y = 0.5 + 0.38 * Math.sin(t);
    }
    ws.send(JSON.stringify({ type: 'point', x, y, pinch: false, t: Date.now() }));
    // 5초마다 색 바꿔 채우기 시연
    if (Math.random() < 1 / (rate * 5)) {
      const colors = ['#e63946', '#f4a261', '#e9c46a', '#2a9d8f', '#457b9d', '#7b2cbf', '#3a5a40', '#6d4c41'];
      const c = colors[Math.floor(Math.random() * colors.length)];
      ws.send(JSON.stringify({ type: 'fill', x, y, color: c }));
      console.log(`[sim] fill 전송 (${x.toFixed(2)}, ${y.toFixed(2)}) color=${c}`);
    }
  }, 1000 / rate);
});

ws.on('message', (data) => {
  try {
    const msg = JSON.parse(String(data));
    console.log(`[sim] ← ${msg.type}`, msg.code ?? '');
  } catch {
    /* noop */
  }
});

ws.on('error', (err) => {
  console.error('[sim] 에러:', err.message);
  process.exit(1);
});
