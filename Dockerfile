# Imagen web (nginx + SPA estática). Desde el corte 2D es la única imagen de este Dockerfile: el servidor es el backend
# Java (backend/Dockerfile) y Node (apps/server) queda solo como oráculo de pruebas, sin imagen.
# Nombres completos (docker.io/...): podman no resuelve nombres cortos sin TTY.

# La salida de TypeScript/Vite no depende de la arquitectura: se compila en la plataforma del runner para no ejecutar
# npm ni Vite bajo QEMU al publicar la imagen ARM64.
FROM --platform=$BUILDPLATFORM docker.io/library/node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* tsconfig.base.json eslint.config.mjs ./
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
# apps/server sigue siendo un workspace: su package.json mantiene `npm ci` en línea con el lockfile y su esquema
# Prisma alimenta el postinstall (`db:generate`). No se compila ni se copia a la imagen.
COPY apps/server/package.json ./apps/server/
COPY apps/server/prisma ./apps/server/prisma
COPY frontend/package.json frontend/tsconfig*.json frontend/vite.config.ts frontend/tailwind.config.js frontend/postcss.config.js ./frontend/
RUN npm ci
COPY packages/shared/src ./packages/shared/src
COPY frontend/src ./frontend/src
COPY frontend/public ./frontend/public
COPY frontend/index.html ./frontend/index.html
RUN npm run build -w @pokemon-universe/shared && npm run build -w @pokemon-universe/web

FROM docker.io/nginxinc/nginx-unprivileged:1.27-alpine AS web
COPY infra/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 8080
