#!/usr/bin/env bash
set -euo pipefail

mkdir -p runtime/session runtime/storage runtime/state runtime/logs
docker compose up -d
