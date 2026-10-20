#!/usr/bin/env bash
# 공개 사이트 루트(site/)를 조립한다: 포털은 /, 게임(폰 앱)은 /play/ .
#   - TV(/tv/)·콘텐츠(/manifest.json, /artworks)는 엣지 nginx가 별도 마운트로 서빙하므로 여기에 넣지 않는다.
#   - 엄빠(/cafe/)는 엣지 nginx가 Node 컨테이너로 프록시한다.
# 사전 조건: `npm run build`로 apps/portal/dist, apps/phone/dist 가 만들어져 있어야 한다.
set -euo pipefail
cd "$(dirname "$0")/.."

for d in apps/portal/dist apps/phone/dist; do
  [ -f "$d/index.html" ] || { echo "[site] $d 가 없습니다. 먼저 npm run build 를 실행하세요." >&2; exit 1; }
done

rm -rf site
mkdir -p site/play
cp -a apps/portal/dist/. site/
cp -a apps/phone/dist/. site/play/
echo "[site] 조립 완료: site/ (포털 /, 게임 /play/)"
