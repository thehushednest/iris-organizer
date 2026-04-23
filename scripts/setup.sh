#!/usr/bin/env bash
set -euo pipefail

if [ ! -f ".env" ]; then
  cp .env.example .env
  echo "[setup] File .env dibuat dari .env.example"
  echo "[setup] Silakan edit .env lalu jalankan ./scripts/start.sh"
  exit 0
fi

mkdir -p runtime/session runtime/storage runtime/state runtime/logs
docker compose up -d --build
echo "[setup] Bot berjalan"
echo "[setup] Cek QR dengan: ./scripts/show-qr.sh"
