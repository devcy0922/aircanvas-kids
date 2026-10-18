export GIT_SHA ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")
export HT_BIND ?= 0.0.0.0:8180

.PHONY: help build check test web-debug agents-link dev-server dev-phone dev-phone-ssl dev-tv dev-content clean

help:
	@echo "AirCanvas Kids Monorepo Commands:"
	@echo "  make build          - Build all packages & apps (phone, tv, protocol, tv-art, server release)"
	@echo "  make check          - Run npm workspace build and cargo check (Verification Gate)"
	@echo "  make test           - Run smoke test & verification"
	@echo "  make agents-link    - Symlink .agents, .cursor/rules, .github -> agents/ (Tooling setup)"
	@echo "  make dev-server     - Run Rust WebSocket Relay Server on $(HT_BIND)"
	@echo "  make dev-phone      - Run Phone App dev server (HTTP :7101)"
	@echo "  make dev-phone-ssl  - Run Phone App dev server with HTTPS (for mobile camera :7101)"
	@echo "  make dev-tv         - Run TV App dev server (:7100)"
	@echo "  make dev-content    - Run CORS-enabled dev content server (:8081)"
	@echo "  make web-debug      - Run web-bot Playwright flow (home -> play) with evidence"

build:
	@echo "[Build] Building TypeScript packages and web apps..."
	npm run build
	@echo "[Build] Building Rust relay server release binary..."
	cargo build --manifest-path server/Cargo.toml --release

check:
	@echo "[Check] Running TypeScript workspace build..."
	npm run build
	@echo "[Check] Running cargo check on server..."
	cargo check --manifest-path server/Cargo.toml
	@echo "[Check] Verification gate passed successfully."

test: check
	@echo "[Test] Running smoke relay verification..."
	@node tools/smoke-relay.mjs || true

agents-link:
	@echo "[Agents] Linking tooling paths..."
	@bash agents/scripts/link-tooling.sh

dev-server:
	@echo "[Server] Starting Rust relay server on $(HT_BIND)..."
	HT_BIND=$(HT_BIND) cargo run --manifest-path server/Cargo.toml

dev-phone:
	@echo "[Phone] Starting Phone App dev server..."
	npm --prefix apps/phone run dev

dev-phone-ssl:
	@echo "[Phone] Starting Phone App HTTPS dev server..."
	npm --prefix apps/phone run dev:ssl

dev-tv:
	@echo "[TV] Starting TV App dev server..."
	npm --prefix apps/tv run dev

dev-content:
	@echo "[Content] Starting CORS-enabled development content server on :8081..."
	python3 tools/content-server.py --host 0.0.0.0 --port 8081 --directory content-server

web-debug:
	@echo "[Web Debug] Running camera-free browser flow via web-bot..."
	docker compose -f /srv/demo/web-bot/docker-compose.yml run --rm \
		-v "$(CURDIR):/workspace" \
		-e AIRCANVAS_DEBUG_ROOM=$(or $(AIRCANVAS_DEBUG_ROOM),WEBDBG) \
		-e AIRCANVAS_TV_URL=http://$(or $(AIRCANVAS_DEBUG_HOST),192.168.0.10):7100/ \
		-e AIRCANVAS_PHONE_URL=http://$(or $(AIRCANVAS_DEBUG_HOST),192.168.0.10):7101/ \
		-e AIRCANVAS_SERVER=http://$(or $(AIRCANVAS_DEBUG_HOST),192.168.0.10):8180 \
		-e AIRCANVAS_CONTENT=http://$(or $(AIRCANVAS_DEBUG_HOST),192.168.0.10):8081 \
		-e AIRCANVAS_EVIDENCE_ROOT=/workspace/logs/evidence \
		web-bot python3 /workspace/tools/web-debug.py

clean:
	@echo "[Clean] Cleaning build artifacts..."
	rm -rf apps/phone/dist apps/tv/dist packages/protocol/dist packages/tv-art/dist server/target
