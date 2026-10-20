# 데이터 수집·지점 Registry·5분 캐시 설계

> 아래 설계는 **구현 제안**이다. 2026-10-14 현재 사이트의 자동 수집 허용 여부, 내부 API, WAF/robots 정책, 호출 한도는 확인되지 않았다. 승인/허용 검증 전에는 수집 스케줄러를 활성화하지 않는다.

## 1. 데이터 소스 분리

### A. 시설 기본 정보 (공공데이터)
- 출처: [서울 열린데이터광장 — 서울형 키즈카페 시설현황정보](https://data.seoul.go.kr/dataList/OA-21716/S/1/datasetView.do)
- 공식 설명에서 위치·이용정원·운영일 등의 시설현황정보 제공을 확인
- 데이터셋에는 **공공누리 제1유형**이 명시됨(출처표시 필수)
- 데이터셋 갱신: 공식 페이지 기준 매월 3일. 최신 갱신일은 사용 시 재확인
- 실제 데이터 필드, API 호출 방식, 좌표 품질은 API 스키마 확인 후 매핑

### B. 예약 현황 (공식 예약 페이지)
- 출처: [서울시 우리동네키움포털 예약 달력 예시](https://umppa.seoul.go.kr/icare/user/kidsCafeResve/BD_selectKidsCafeResveCal.do?q_fcltyId=SC240801)
- 공개 HTML/검색 인덱스에서 날짜 및 '1회 공용 20' 같은 회차별 표시가 관찰됨
- 현 시점에 서버 측 직접 HTTP 수집과 재배포 허용은 **미검증**
- 시설정보 데이터셋의 라이선스가 예약현황까지 자동 확장되지는 않음

## 2. Facility Registry: 한 번 발견한 경로 저장

예시 예약 경로:

```text
https://umppa.seoul.go.kr/icare/user/kidsCafeResve/BD_selectKidsCafeResveCal.do?q_fcltyId=SC240801
```

식별자 `q_fcltyId`는 일부 예약 페이지에서 확인된 URL 파라미터이며, 모든 지점·유형에서 통용되는지는 추가 검증이 필요하다. 추가 파라미터가 필요한 시설은 공식 링크를 그대로 저장한다.

Registry 스키마 예시 (실제 구현은 DB 마이그레이션으로 확정):

```json
{
  "source": "seoul_umppa",
  "facility_id": "SC240801",
  "name": "서초구 서초1동점",
  "district": "서초구",
  "address": null,
  "latitude": null,
  "longitude": null,
  "age_min_months": null,
  "age_max_months": null,
  "age_rule_source_url": null,
  "reservation_url": "https://umppa.seoul.go.kr/icare/user/kidsCafeResve/BD_selectKidsCafeResveCal.do?q_fcltyId=SC240801",
  "fetch_strategy": "unverified",
  "last_mapping_verified_at": null
}
```

DB 권장 분리:
- `facilities`: 시설 공통 정보, 주소, 좌표, 연령 규칙, 공식 상세 링크
- `facility_sources`: 외부 제공처, 제공처 시설 ID, 예약 URL, 파서 종류, 맵핑 검증일
- `availability_snapshots`: 시설 ID, 날짜, 회차, 예약 구분, 상태, 수치, 제공처 확인 시각, 데이터 버전
- `collector_runs`: 요청 시작/종료, 상태코드, 파서 버전, 에러 종류, 제한 징후 (쿠키·개인정보·원본 페이지 전체 저장 금지)

시설 ID가 중복될 수 있는 다른 제공처를 대비하여 외부키는 (`source`, `facility_id`)로 구성. URL이나 내부 상태를 신뢰하지 말고 외부 이동 시 허용한 공식 호스트만 검증한다.

## 3. 처리 파이프라인

```text
서울시 시설현황 ──> Normalize/Geocode ──> Facility Registry
                                              |
예약 URL (사전 검증) ──> Collector (허용 시) ──> Parse
                                              |
                                   Availability Snapshot
                                              |
                            Cache (facility + date + type)
                                              |
                         Search API / Manual Refresh API
                                              |
                         UI last_checked_at + official link
```

수집 로직은 공급원별 adapter interface로 분리한다. 먼저 HTML 렌더에 숫자가 있는지 검증하고, 별도 Fetch/XHR 엔드포인트가 있다면 공식적으로 허용된 요청 방식인지 추가 검토한다. 미공개 엔드포인트를 임의로 대량 호출하지 않는다.

## 4. 갱신 정책

**제안 기본값**
- 일반 조회 TTL: **300초(5분)**
- 요청이 들어올 때 유효 캐시가 있으면 캐시 즉시 반환
- 만료되어도 기존 정보가 있으면 캐시를 보여주되 freshness='stale' 및 갱신 작업 진행 표시 (stale-while-revalidate)
- 수동 새로고침: 선택 시설/기간만 재조회 요청; 허용되는 경우 **전역 시설별 최소 요청 간격 60~90초** 초안
- 사용자별 연속 클릭 제한, IP 단위 rate limit, 일일 전체 호출량 한도, 파서 장애 알람
- 같은 지점/날짜/예약유형은 동시 요청을 **singleflight**로 병합
- 공식 사이트가 허용한 최소 요청 간격이 더 길다면 그 값을 따름
- 시차 없이 표기: 수집 시각은 ISO 8601 UTC로 저장, 한국 시간(KST)으로 표시

**중요:** 5분 캐시는 '평균 5분 이내 실제 좌석 상태를 보장한다'는 의미가 아니다. 수집 실패 시 더 오래된 결과가 남을 수 있으므로 freshness 및 명확한 경고 필수.

### 새로고침 API의 기대 동작

```text
POST /api/facilities/{id}/availability/refresh
{ "date": "2026-10-17" }

200 -> 캐시가 이미 최근 것이라 해당 값 즉시 반환
202 -> 백그라운드 갱신 작업 접수, 작업 ID 또는 polling 링크
429 -> 사용자 또는 시설 호출 제한, Retry-After
503 -> 수집 미허용/공식 제공처 장애, 기존 캐시 + 상태 안내
```

API 구조는 설계 예시이고 아직 구현되지 않았다. 클라이언트에서 외부 사이트를 직접 호출하지 않고 서버가 수집 작업을 합친다.

## 5. 회차별 정규화

원본 표기 예:
- `2026-10-14 1회 공용 20`
- `2026-10-14 3회 개인 24`
- `휴일` / `자체휴회` / `프로그램` / 아무 표시 없음

정규화 키: (`source`, `facility_id`, `date`, `session_label`, `booking_type`).

```json
{
  "facility_id": "SC240801",
  "date": "2026-10-14",
  "session_label": "1회",
  "booking_type": "공용",
  "displayed_number": 20,
  "number_semantics": "unverified",
  "status": "UNKNOWN",
  "checked_at": null,
  "source_url": "https://umppa.seoul.go.kr/icare/user/kidsCafeResve/BD_selectKidsCafeResveCal.do?q_fcltyId=SC240801"
}
```

단위/예약가능 수치를 검증하기 전까지는 '좌석 수'로 단정하지 않는다. 시설별 상세 회차 선택 결과와 대조해 `number_semantics`와 상태 파싱을 확정한다.

필수 규칙:
- `0`이 항상 마감인지 예약 유형/회차별로 확인; 확인 못하면 UNKNOWN
- 원본 날짜에 표시가 없으면 FULL로 추정하지 않는다
- 휴관, 예약 오픈 전, 공식 제공처 장애, 파싱 실패를 별도 식별
- 원문 파서 변경/필드 불일치가 생기면 UNKNOWN으로 강등
- 최소 5개 지점 × 2개 날짜 × 개인/공용/휴일 사례 테스트 후 파서 확정

## 6. 장애와 안전장치

- HTTP 401/403, 429, CAPTCHA, 예상 못한 로그인 리다이렉트: 중단/후퇴. 우회 금지
- 5xx·타임아웃: 지수 백오프, 재시도 상한, 출처 전체 장애면 회로 차단
- robots 정책·이용약관에서 차단하거나 운영자 중지 요청: 수집 중지
- 외부 연결의 SSRF 방지: 고정 공식 도메인 allowlist, 리다이렉트 및 DNS 재검증
- 사용자 위치는 기본적으로 브라우저에서 활용하고 서버 영구 저장 금지
- 원본 세션/쿠키, 사용자 개인정보, 예약자 목록은 수집하지 않음
- 서버 캐시의 일시적 갱신 실패는 '마감'이 아니라 UNKNOWN/STALE로 표시

## 7. 관측 지표

- 수집 성공률 / 파싱 성공률 / 시설 매핑 커버리지
- 예약 현황 수치 불일치율 (공식 화면 수동 대조)
- 요청 수와 평균 응답 시간 / 403,429,CAPTCHA 횟수
- 캐시 hit ratio / 데이터 freshness 분포
- 수동 갱신 요청 → 실제 outbound 요청의 비율(singleflight 효율)
- 공식 예약으로 이동 클릭률 (외부 예약 완료율과 혼동 금지)

## 참고

- [제품 요구사항](PRODUCT.md)
- [법적 검토 및 봇 차단](LEGAL_AND_ROBOTS.md)
- [PoC 계획](MVP_PLAN.md)
