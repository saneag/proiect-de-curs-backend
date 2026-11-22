#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

if (( EUID != 0 )); then
    exec sudo -- bash "$SCRIPT_DIR/start-friendo.sh" "$@"
fi

# Works for manual invocation and for the systemd boot service.
systemctl start docker
exec 9>/run/lock/friendo-start.lock
flock -n 9 || { echo "Friendo startup is already running." >&2; exit 1; }
exec python3 "$SCRIPT_DIR/start-friendo.py" "$@"
