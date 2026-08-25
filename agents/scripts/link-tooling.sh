#!/usr/bin/env bash
# agents/scripts/link-tooling.sh
# 도구별 경로(.agents, .cursor, .github/copilot-instructions.md 등)를 루트 agents/ SSOT에 심볼릭 링크로 연결한다.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
AGENTS="$ROOT/agents"

if [[ ! -f "$AGENTS/rules.md" ]]; then
  echo "error: agents/rules.md missing at $AGENTS" >&2
  exit 1
fi

link_path() {
  local target="$1"
  local source="$2"
  local parent
  parent="$(dirname "$target")"
  mkdir -p "$parent"

  local rel
  rel="$(python3 -c "import os; print(os.path.relpath('$source', '$parent'))")"

  if [[ -L "$target" ]]; then
    local current
    current="$(readlink "$target")"
    if [[ "$current" == "$rel" ]]; then
      echo "  ok  $target"
      return
    fi
    rm -f "$target"
  elif [[ -e "$target" ]]; then
    echo "error: $target exists and is not a symlink — removing" >&2
    rm -rf "$target"
  fi

  ln -sfn "$rel" "$target"
  echo "  link $target -> $rel"
}

echo "Linking tooling paths -> agents/ (repo root: $ROOT)"

# 1. Antigravity / Legacy .agents -> agents
link_path "$ROOT/.agents" "$AGENTS"

# 2. Cursor Rules (.cursor/rules/)
mkdir -p "$ROOT/.cursor/rules"
link_path "$ROOT/.cursor/rules/aircanvas-core.mdc" "$AGENTS/rules.md"
link_path "$ROOT/.cursor/rules/frontend-design.mdc" "$AGENTS/skills/frontend-design/SKILL.md"

# 3. GitHub Copilot Instructions
link_path "$ROOT/.github/copilot-instructions.md" "$AGENTS/rules.md"

echo "Done. Verify: ls -la .agents .cursor/rules .github"
