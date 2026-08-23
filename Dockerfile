# TypeScript/Vite output is architecture-independent. Building it on the native
# runner avoids running npm, Prisma generation and Vite under ARM64 QEMU.
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
ARG PU_COMMIT_SHA=""
WORKDIR /app
COPY package.json package-lock.json* tsconfig.base.json eslint.config.mjs ./
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
COPY apps/server/package.json apps/server/tsconfig.json ./apps/server/
COPY apps/web/package.json apps/web/tsconfig*.json apps/web/vite.config.ts apps/web/tailwind.config.js apps/web/postcss.config.js ./apps/web/
COPY apps/server/prisma ./apps/server/prisma
# The build stage intentionally runs on BUILDPLATFORM so TypeScript/Vite do not
# execute through QEMU. Sharp is the one runtime-native dependency: retain the
# native musl package for ARM64 as well as the host package so the same cached
# build output remains valid for both published Alpine images.
RUN npm ci \
    && npm install --no-save --package-lock=false --ignore-scripts --force \
      @img/sharp-linuxmusl-arm64@0.35.3 \
      @img/sharp-libvips-linuxmusl-arm64@1.3.2
COPY packages/shared/src ./packages/shared/src
COPY apps/server/src ./apps/server/src
COPY apps/web/src ./apps/web/src
COPY apps/web/public ./apps/web/public
COPY apps/web/index.html ./apps/web/index.html
RUN npm run build

FROM node:22-alpine AS server
ARG PU_COMMIT_SHA=""
WORKDIR /app
ENV NODE_ENV=production \
    PU_COMMIT_SHA=${PU_COMMIT_SHA} \
    CHECKPOINT_DISABLE=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=true
COPY --from=build /app/package.json /app/package-lock.json* ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/apps/server/package.json ./apps/server/package.json
COPY --from=build /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/server/prisma ./apps/server/prisma
COPY --chmod=755 scripts/start-server.sh /usr/local/bin/start-pokemon-universe
RUN mkdir -p /data/avatars && chown -R node:node /data
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3001/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["start-pokemon-universe"]

FROM nginxinc/nginx-unprivileged:1.27-alpine AS web
COPY infra/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
