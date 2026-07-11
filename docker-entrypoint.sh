#!/bin/sh
set -e

# Volume-Rechte reparieren: das Daten-Volume kann als root angelegt worden
# sein. Läuft als root, fixt die Rechte und droppt dann auf appuser
# (gleiches Muster wie QuestHall).
if [ -d /app/data ]; then
  chown -R appuser:appgroup /app/data 2>/dev/null || true
fi

exec su-exec appuser "$@"
