'use strict';
/**
 * S-Kids 데모 서버 (Phase 1 MVP + Phase 2 구조 시뮬레이션)
 *
 * - 시설 Registry(서울 열린데이터광장 OA-21716 스키마 예시) 기반 검색 API
 * - 필터: 자치구(복수) / 위치 반경(1·3·5·10km) / 이용 연령(개월) / 날짜
 * - 5분 TTL 캐시 + last_checked_at + stale 표시 (stale-while-revalidate)
 * - 수동 새로고침: 시설별 60초 cooldown + singleflight 병합
 * - 예약 현황 출처: demo-simulator (실제 공식 사이트 HTTP 수집은 Phase 0
 *   법적·봇 정책 검증 완료 전 금지 — docs/LEGAL_AND_ROBOTS.md)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 8124);
const PUBLIC_DIR = path.join(__dirname, 'public');

const CACHE_TTL_MS = 5 * 60 * 1000;      // 기본 캐시 TTL 5분
const REFRESH_COOLDOWN_MS = 60 * 1000;   // 시설별 수동 새로고침 최소 간격 60초
const SESSIONS = ['1회', '2회', '3회'];

const DISTRICT_CENTROIDS = {
  '강남구': [37.516, 127.03], '강동구': [37.61, 127.122], '강서구': [37.553, 126.853],
  '관악구': [37.461, 126.946], '광진구': [37.564, 127.055], '구로구': [37.5, 126.889],
  '금천구': [37.576, 126.863], '노원구': [37.666, 127.061], '도봉구': [37.659, 127.09],
  '동대문구': [37.585, 127.052], '동작구': [37.511, 126.923], '마포구': [37.575, 126.948],
  '서대문구': [37.573, 126.932], '서초구': [37.501, 126.99], '성동구': [37.586, 127.028],
  '성북구': [37.625, 127.016], '송파구': [37.514, 127.107], '양천구': [37.513, 126.875],
  '영등포구': [37.527, 126.931], '용산구': [37.546, 126.981], '은평구': [37.605, 126.943],
  '종로구': [37.573, 126.959], '중구': [37.57, 126.986], '중랑구': [37.6, 127.067],
  '강북구': [37.663, 127.035],
};

const db = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'data', 'facilities.json'), 'utf8')
);
const FACILITIES = db.facilities;

// ---------------------------------------------------------------------------
// 캐시 상태
// ---------------------------------------------------------------------------
const cache = new Map();        // key: `${facilityId}|${date}` -> snapshot
const lastRefreshAt = new Map(); // facilityId -> epoch ms (cooldown용)
const inflight = new Map();     // key -> Promise (singleflight)

function nowIso() {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// 데모 예약현황 시뮬레이터 (외부 HTTP 호출 없음 — 수집 미허가 전 안전장치)
// 결정적 해시로 같은 시설/날짜/회차에는 같은 수치를 반환해 재현 가능
// ---------------------------------------------------------------------------
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function pickStatus(seed) {
  const r = seed % 100;
  if (r < 38) return 'AVAILABLE';
  if (r < 62) return 'FULL';
  if (r < 78) return 'NOT_OPEN';
  if (r < 90) return 'CLOSED';
  return 'UNKNOWN';
}

function simulateFetch(facility, date) {
  // 실제 collector가 들어갈 adapter 위치. 데모에서는 300~700ms 지연만 시뮬레이션.
  const delay = 300 + (fnv1a(facility.facility_id + date + 'delay') % 400);
  return new Promise((resolve) => {
    setTimeout(() => {
      const sessions = SESSIONS.map((label) => {
        const seed = fnv1a(`${facility.facility_id}|${date}|${label}`);
        const status = pickStatus(seed);
        return {
          session_label: label,
          status,
          displayed_number:
            status === 'AVAILABLE' ? (seed % 20) + 1 : null,
          number_semantics: 'unverified', // 단위(명/자리) 검증 전 — PRD §4
          checked_at: nowIso(),
        };
      });
      resolve({
        source: 'demo-simulator',
        demo: true,
        facility_id: facility.facility_id,
        date,
        sessions,
        checked_at: nowIso(),
        source_url: facility.reservation_url,
        note: '데모 시뮬레이션 데이터입니다. 실제 예약 현황이 아닙니다.',
      });
    }, delay);
  });
}

// ---------------------------------------------------------------------------
// 캐시 / singleflight / stale-while-revalidate
// ---------------------------------------------------------------------------
function cacheKey(facilityId, date) {
  return `${facilityId}|${date}`;
}

function getCacheEntry(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  const age = Date.now() - Date.parse(entry.checked_at);
  return { entry, fresh: age < CACHE_TTL_MS };
}

async function ensureAvailability(facility, date, { force = false } = {}) {
  const key = cacheKey(facility.facility_id, date);
  const hit = getCacheEntry(key);

  if (!force && hit && hit.fresh) {
    return { ...hit.entry, freshness: 'fresh' };
  }
  if (!force && hit && !hit.fresh) {
    // stale-while-revalidate: 오래된 값을 즉시 반환하고 백그라운드로 갱신
    triggerRefresh(facility, date);
    return { ...hit.entry, freshness: 'stale' };
  }

  if (inflight.has(key)) {
    return inflight.get(key); // 동시 요청 병합 (singleflight)
  }
  const task = (async () => {
    try {
      const snapshot = await simulateFetch(facility, date);
      cache.set(key, snapshot);
      if (force) lastRefreshAt.set(facility.facility_id, Date.now());
      return { ...snapshot, freshness: 'fresh' };
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, task);
  return task;
}

// 백그라운드 갱신 (결과 미대기). 실패하면 기존 캐시를 유지하고 다음 조회에서 재시도
function triggerRefresh(facility, date) {
  const key = cacheKey(facility.facility_id, date);
  if (inflight.has(key)) return;
  const task = (async () => {
    try {
      const snapshot = await simulateFetch(facility, date);
      cache.set(key, snapshot);
    } catch {
      /* 기존 캐시 유지 */
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, task);
}

// ---------------------------------------------------------------------------
// 필터 유틸
// ---------------------------------------------------------------------------
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function ageRangeLabel(f) {
  if (f.age_min_months == null && f.age_max_months == null) return null;
  const fmt = (m) => (m % 12 === 0 ? `${m / 12}세` : `${m}개월`);
  if (f.age_min_months == null) return `${fmt(f.age_max_months)} 이하`;
  if (f.age_max_months == null) return `${fmt(f.age_min_months)} 이상`;
  return `${fmt(f.age_min_months)} ~ ${fmt(f.age_max_months)}`;
}

function searchFacilities(query) {
  const districts = (query.get('districts') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(query.get('date') || '')
    ? query.get('date')
    : new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); // KST 기준 오늘
  const ageMonths = query.has('age_months') ? Number(query.get('age_months')) : null;
  const lat = query.has('lat') ? Number(query.get('lat')) : NaN;
  const lng = query.has('lng') ? Number(query.get('lng')) : NaN;
  const radiusKm = query.has('radius_km') ? Number(query.get('radius_km')) : NaN;
  const hasLocation =
    Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const hasRadius = [1, 3, 5, 10].includes(radiusKm);

  const results = [];
  for (const f of FACILITIES) {
    if (districts.length && !districts.includes(f.district)) continue;

    // 거리 계산: 사용자 좌표 우선, 없으면 자치구 중심점 fallback (PRD §3)
    let distanceKm = null;
    let distanceBasis = null;
    if (f.latitude != null && f.longitude != null) {
      if (hasLocation) {
        distanceKm = haversineKm(lat, lng, f.latitude, f.longitude);
        distanceBasis = 'user_location';
      } else {
        const c = DISTRICT_CENTROIDS[f.district];
        if (c) {
          distanceKm = haversineKm(c[0], c[1], f.latitude, f.longitude);
          distanceBasis = 'district_centroid';
        }
      }
      if (hasLocation && hasRadius && distanceKm > radiusKm) continue;
    }

    // 연령 필터
    let eligibility = null;
    if (ageMonths != null && Number.isFinite(ageMonths)) {
      if (f.age_min_months == null || f.age_max_months == null) {
        eligibility = 'review'; // 연령 확인 필요
      } else if (ageMonths < f.age_min_months || ageMonths > f.age_max_months) {
        continue; // 이용 불가 시설은 제외
      } else {
        eligibility = 'eligible';
      }
    }

    results.push({
      ...f,
      age_range: ageRangeLabel(f),
      distance_km: distanceKm == null ? null : Math.round(distanceKm * 100) / 100,
      distance_basis: distanceBasis,
      age_eligibility: eligibility,
      _date: date,
    });
  }

  results.sort((a, b) => {
    if (a.distance_km == null) return 1;
    if (b.distance_km == null) return -1;
    return a.distance_km - b.distance_km;
  });
  return { date, results };
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
function sendJson(res, status, body) {
  const text = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(text);
}

function readBody(req, limit = 8192) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;

  try {
    if (req.method === 'GET' && p === '/healthz') {
      return sendJson(res, 200, {
        status: 'ok',
        service: 'kids-cafe',
        mode: 'demo',
        time: nowIso(),
        note: '예약 현황은 데모 시뮬레이션 데이터입니다.',
      });
    }

    if (req.method === 'GET' && p === '/api/districts') {
      return sendJson(res, 200, { districts: Object.keys(DISTRICT_CENTROIDS) });
    }

    if (req.method === 'GET' && p === '/api/facilities') {
      const { date, results } = searchFacilities(url.searchParams);
      const withAvailability = await Promise.all(
        results.map(async (f) => ({
          ...f,
          availability: await ensureAvailability(f, date),
        }))
      );
      return sendJson(res, 200, {
        demo: true,
        date,
        count: withAvailability.length,
        results: withAvailability,
      });
    }

    const singleFacilityMatch = p.match(/^\/api\/facilities\/([^/]+)$/);
    if (req.method === 'GET' && singleFacilityMatch) {
      const facilityId = decodeURIComponent(singleFacilityMatch[1]);
      const facility = FACILITIES.find((f) => f.facility_id === facilityId);
      if (!facility) {
        return sendJson(res, 404, { error: 'facility not found' });
      }
      const date = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('date') || '')
        ? url.searchParams.get('date')
        : new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
      const availability = await ensureAvailability(facility, date);
      return sendJson(res, 200, {
        ...facility,
        age_range: ageRangeLabel(facility),
        availability,
        date,
      });
    }

    const refreshMatch = p.match(
      /^\/api\/facilities\/([^/]+)\/availability\/refresh$/
    );
    if (req.method === 'POST' && refreshMatch) {
      const facilityId = decodeURIComponent(refreshMatch[1]);
      const facility = FACILITIES.find((f) => f.facility_id === facilityId);
      if (!facility) {
        return sendJson(res, 404, { error: 'facility not found' });
      }
      let date;
      try {
        const body = JSON.parse((await readBody(req)) || '{}');
        date = body.date;
      } catch {
        return sendJson(res, 400, { error: 'invalid JSON body' });
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
        return sendJson(res, 400, { error: 'date must be YYYY-MM-DD' });
      }

      const key = cacheKey(facility.facility_id, date);
      const hit = getCacheEntry(key);
      if (hit && hit.fresh) {
        return sendJson(res, 200, {
          status: 'cached',
          ...hit.entry,
          freshness: 'fresh',
          checked_at_display: '최근 확인한 내용(5분 내 캐시)',
        });
      }
      const since = Date.now() - (lastRefreshAt.get(facilityId) || 0);
      if (since < REFRESH_COOLDOWN_MS) {
        // cooldown: 새로고침 거부 + 기존 캐시 반환 (PRD §5)
        return sendJson(res, 429, {
          status: 'rate_limited',
          retry_after_seconds: Math.ceil((REFRESH_COOLDOWN_MS - since) / 1000),
          message: '최근에 갱신했습니다. 잠시 후 다시 시도해주세요.',
          cached: hit ? { ...hit.entry, freshness: 'stale' } : null,
        });
      }

      const result = await ensureAvailability(facility, date, { force: true });
      return sendJson(res, 200, { status: 'refreshed', ...result });
    }

    // 정적 파일
    if (req.method === 'GET') {
      const rel = p === '/' ? 'index.html' : p.replace(/^\/public\//, '');
      const file = path.normalize(path.join(PUBLIC_DIR, rel));
      if (!file.startsWith(PUBLIC_DIR)) {
        return sendJson(res, 403, { error: 'forbidden' });
      }
      fs.readFile(file, (err, data) => {
        if (err) return sendJson(res, 404, { error: 'not found' });
        const ext = path.extname(file);
        const types = {
          '.html': 'text/html; charset=utf-8',
          '.js': 'text/javascript; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.svg': 'image/svg+xml',
          '.json': 'application/json; charset=utf-8',
        };
        res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
        res.end(data);
      });
      return;
    }

    return sendJson(res, 405, { error: 'method not allowed' });
  } catch (err) {
    return sendJson(res, 500, { error: 'internal error', detail: String(err) });
  }
});

server.listen(PORT, () => {
  console.log(`[kids-cafe] demo server listening on :${PORT}`);
});
