#!/usr/bin/env bash
set -euo pipefail

QR_FILE="runtime/logs/latest-qr.txt"

if [ ! -f "$QR_FILE" ]; then
  echo "[qr] QR belum tersedia. Cek log dulu dengan ./scripts/logs.sh"
  exit 1
fi

cat "$QR_FILE"
