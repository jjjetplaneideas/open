#!/bin/bash
# SessionStart hook for Claude Code on the web.
#
# Prepares both halves of the monorepo so tests/linters/type-checks work
# immediately in a fresh web session:
#   - engine/  Rust shared editor engine  -> rustfmt + clippy + cargo build
#   - app/     Expo / React Native client -> npm install + tsc available
set -euo pipefail

# Only run in the remote (Claude Code on the web) environment.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

ROOT="${CLAUDE_PROJECT_DIR:-.}"
cd "$ROOT"

# --- Rust engine -------------------------------------------------------------
if [ -f "$HOME/.cargo/env" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.cargo/env"
fi
if command -v rustup >/dev/null 2>&1; then
  rustup component add rustfmt clippy >/dev/null 2>&1 || true
fi
if [ -d engine ]; then
  ( cd engine && cargo fetch && cargo build )
fi

# --- Mobile app --------------------------------------------------------------
if [ -f app/package.json ]; then
  # `npm install` (not `ci`) so the cached container state is reused on resume.
  ( cd app && npm install --no-audit --no-fund )
fi

echo "session-start: environment ready (rustc $(rustc --version 2>/dev/null | awk '{print $2}'), node $(node --version 2>/dev/null))"
