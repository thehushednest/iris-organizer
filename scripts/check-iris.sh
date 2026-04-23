#!/usr/bin/env bash
set -euo pipefail

if [ ! -f ".env" ]; then
  echo "[check-iris] .env belum ada"
  exit 1
fi

set -a
. ./.env
set +a

if [ -z "${IRIS_BASE_URL:-}" ] || [ -z "${IRIS_DECIDE_PATH:-}" ] || [ -z "${IRIS_API_TOKEN:-}" ]; then
  echo "[check-iris] IRIS_BASE_URL / IRIS_DECIDE_PATH / IRIS_API_TOKEN belum lengkap di .env"
  exit 1
fi

curl -sS \
  -X POST \
  -H "Authorization: Bearer ${IRIS_API_TOKEN}" \
  -H "Content-Type: application/json" \
  "${IRIS_BASE_URL}${IRIS_DECIDE_PATH}" \
  -d '{"text":"tolong cari kontrak april","hasMedia":false,"lastSearchResults":[]}' | sed 's/^/[check-iris] /'
