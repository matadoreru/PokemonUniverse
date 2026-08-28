#!/usr/bin/env sh
set -eu

prisma_bin=./node_modules/.bin/prisma
if [ ! -x "$prisma_bin" ]; then
  prisma_bin=./apps/server/node_modules/.bin/prisma
fi
"$prisma_bin" migrate deploy --schema apps/server/prisma/schema.prisma
exec node apps/server/dist/src/index.js
