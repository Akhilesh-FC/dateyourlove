#!/bin/bash
set -e

cd "$(dirname "$0")/.."

export NODE_ENV=production
npm ci --omit=dev

if [ ! -f .env ]; then
  echo "No .env file found. Make sure Plesk environment variables are configured."
fi

pm2 restart all || true
