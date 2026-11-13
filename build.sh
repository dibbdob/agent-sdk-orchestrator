#!/usr/bin/env bash
# The whole gate. Nothing here calls the model.
set -euo pipefail
cd "$(dirname "$0")"

echo "== types"
node_modules/.bin/tsc

echo "== tests"
out="$(node --test 'test/**/*.test.ts' 2>&1)" || { echo "$out"; exit 1; }
echo "$out" | grep -E '^ℹ (tests|pass|fail) '
# A run that finds no tests is not a pass.
echo "$out" | grep -qE '^ℹ tests [1-9]' || { echo "No tests ran." >&2; exit 1; }

echo "== build passed"
