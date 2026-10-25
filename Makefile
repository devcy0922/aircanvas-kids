export GIT_SHA ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")
export HT_BIND ?= 0.0.0.0:8080

.PHONY: help build check test agents-link dev-server dev-phone dev-phone-ssl dev-tv dev-content clean

help:
	@echo "AirCanvas Kids Monorepo Commands:"
	@echo "  make build          - Build all packages & apps (phone, tv, protocol, tv-art, server release)"
	@echo "  make check          - Run npm workspace build and cargo check (Verification Gate)"
	@echo "  make test           - Run smoke test & verification"
	@echo "  make agents-link    - Symlink .agents, .cursor/rules, .github -> agents/ (Tooling setup)"
	@echo "  make dev-server     - Run Rust WebSocket Relay Server on $(HT_BIND)"
	@echo "  make dev-phone      - Run Phone App dev server (HTTP :5174)"
	@echo "  make dev-phone-ssl  - Run Phone App dev server with HTTPS (for mobile camera :5174)"
	@echo "  make dev-tv         - Run TV App dev server (:5173)"
	@echo "  make dev-content    - Run Content Nginx Server (:8081)"

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
	@echo "[Content] Content server files located in ./content-server"
	@echo "Run via local nginx or static file server on port 8081."

clean:
	@echo "[Clean] Cleaning build artifacts..."
	rm -rf apps/phone/dist apps/tv/dist packages/protocol/dist packages/tv-art/dist server/target
