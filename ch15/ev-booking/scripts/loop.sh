#!/usr/bin/env bash
# Usage: scripts/loop.sh "작업 설명". This entry point does not alter tests or hook switches.
set -euo pipefail
loop_script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
exec node "$loop_script_dir/loop.mjs" "$@"
