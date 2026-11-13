#!/usr/bin/env bash
# The whole gate. Nothing here calls the model.
set -euo pipefail
cd "$(dirname "$0")"

echo "== types"
node_modules/.bin/tsc

echo "== tests"
node --test 'test/**/*.test.ts' 2>&1 | grep -E '^ℹ (tests|pass|fail) '

echo "== build passed"
