#!/bin/sh
set -e
mkdir -p /app/storage/meal-images /app/uploads
chown -R node:node /app/storage /app/uploads
exec su-exec node "$@"
