#!/usr/bin/env bash
set -e
if [ ! -d node_modules ]; then
  npm install
fi
node index.js
