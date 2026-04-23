#!/usr/bin/env bash
set -euo pipefail

SERVICE_DIR="${HOME}/.config/systemd/user"
SERVICE_NAME="iris-remote-organizer-bot.service"

mkdir -p "${SERVICE_DIR}"
cp systemd/${SERVICE_NAME} "${SERVICE_DIR}/${SERVICE_NAME}"

systemctl --user daemon-reload
systemctl --user enable "${SERVICE_NAME}"
systemctl --user start "${SERVICE_NAME}"

echo "[systemd] Service user-level berhasil diaktifkan"
echo "[systemd] Cek status: systemctl --user status ${SERVICE_NAME}"
