#!/usr/bin/env sh
set -eu

./node_modules/.bin/prisma migrate deploy --schema apps/server/prisma/schema.prisma
node apps/server/dist/prisma/seed.js
exec node apps/server/dist/src/index.js
