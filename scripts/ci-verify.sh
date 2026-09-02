#!/usr/bin/env bash
set -euo pipefail

# Legacy compatibility entrypoint. The maintained implementation is cross-platform Node.
project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec npm --prefix "${project_root}" run ci:verify -- "$@"
