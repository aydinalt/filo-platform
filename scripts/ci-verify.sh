#!/usr/bin/env bash
set -euo pipefail

npm run security:scan
npm run migration:lint
npm run gates:4-15
npm run capacity:verify
npm run readiness:final
npm run technical:readiness
npm run lint
npm run typecheck
npm test
npm run release:manifest
npm run sbom
