#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required to run main.py" >&2
  exit 1
fi

if [ ! -d node_modules ]; then
  npm install --legacy-peer-deps
fi

python3 -c "import telegram, requests" >/dev/null 2>&1 || python3 -m pip install --no-cache-dir -r requirements.txt

exec python3 main.py
