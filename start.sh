#!/usr/bin/env bash
set -e
if [ ! -d node_modules ]; then
  npm install --legacy-peer-deps
fi
npm run start:optimized
