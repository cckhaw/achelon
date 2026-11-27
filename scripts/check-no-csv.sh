#!/usr/bin/env bash
# Fails if any CSV (real member data / CRM exports) is tracked or staged. Used by the pre-commit hook and CI.
set -euo pipefail
mode="${1:-staged}"
if [ "$mode" = "staged" ]; then files=$(git diff --cached --name-only --diff-filter=ACMR); else files=$(git ls-files); fi
bad=$(printf '%s\n' "$files" | grep -iE '\.csv$' | grep -vE '^(tests/fixtures/|e2e/fixtures/)[^/]*\.example\.csv$' || true)
if [ -n "$bad" ]; then
  echo "Refusing: CSV files must never be committed (real member data):" >&2
  echo "$bad" >&2
  echo "Keep CRM exports outside the repo or under import/ (git-ignored). Fictional samples must be named *.example.csv under tests/fixtures/." >&2
  exit 1
fi
