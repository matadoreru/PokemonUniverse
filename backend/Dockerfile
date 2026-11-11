# El jar es independiente de la arquitectura: se compila en la plataforma del
# runner para no ejecutar Gradle bajo QEMU al publicar la imagen ARM64.
FROM --platform=$BUILDPLATFORM docker.io/library/eclipse-temurin:25-jdk-alpine AS build
WORKDIR /src
COPY gradlew settings.gradle.kts build.gradle.kts gradle.properties ./
COPY gradle ./gradle
RUN ./gradlew --no-daemon --version
COPY src ./src
COPY openapi ./openapi
RUN ./gradlew --no-daemon assemble -x test
# libwebp nativa de webp-imageio (escritura de avatares) para la arquitectura de destino. Por defecto se extrae a
# java.io.tmpdir al primer uso; si /tmp no admite ejecución (tmpfs noexec), la carga cae a java.library.path, que
# apunta a esta copia de la imagen. El .so está enlazado contra glibc pero solo usa símbolos que musl también exporta.
ARG TARGETARCH
RUN case "${TARGETARCH:-amd64}" in amd64) arch=x86_64 ;; arm64) arch=aarch64 ;; \
      *) echo "Arquitectura sin libwebp empaquetada: ${TARGETARCH}" >&2; exit 1 ;; esac \
 && mkdir -p /src/native /tmp/webp && cd /tmp/webp \
 && jar xf "$(ls /src/build/docker/main/layers/libs/webp-imageio-*.jar)" "native/Linux/${arch}/libwebp-imageio.so" \
 && cp "native/Linux/${arch}/libwebp-imageio.so" /src/native/

FROM docker.io/library/eclipse-temurin:25-jre-alpine
ARG PU_COMMIT_SHA=""
ENV PU_COMMIT_SHA=${PU_COMMIT_SHA} \
    JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75 -XX:+UseSerialGC -Djava.awt.headless=true -Dlogback.configurationFile=logback-prod.xml -Djava.library.path=/app/native"
WORKDIR /app
# El plugin de Micronaut 5 no genera un jar "-all": `assemble` deja en
# build/docker/main/layers un jar fino cuyo Class-Path apunta a libs/ y
# resources/. Se copian por capas (dependencias primero, para cachearlas).
ARG LAYERS=/src/build/docker/main/layers
COPY --from=build ${LAYERS}/libs /app/libs
COPY --from=build ${LAYERS}/snapshot_libs /app/libs
COPY --from=build ${LAYERS}/project_libs /app/libs
COPY --from=build ${LAYERS}/resources /app/resources
COPY --from=build ${LAYERS}/app/application.jar /app/app.jar
COPY --from=build /src/native /app/native
# PNG del modo Artwork (POKEMON_ARTWORK_DIR=/app/pokemon-artworks en compose). De root y solo lectura: COPY deja
# 644/755, legibles por el uid 1000.
COPY assets/pokemon-artworks /app/pokemon-artworks
# uid/gid 1000: el del usuario `node` de la antigua imagen de Node, dueño de los
# avatares ya guardados (modo 0600) en el volumen; el backend los lee y borra.
RUN mkdir -p /data/avatars && chown -R 1000:1000 /data
USER 1000:1000
EXPOSE 8080
# start-period como compose.yaml: la primera sincronización de PokéAPI (BD vacía) precede a la readiness.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5m --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/health/readiness || exit 1
# webp-imageio llama a System.load: acceso nativo explícito (sin el aviso de Java 24+ y sin fallo cuando se bloquee).
# Con un OutOfMemoryError la JVM sale (código distinto de 0) y el `restart: unless-stopped` de compose reinicia el
# contenedor, en vez de seguir sirviendo degradada. En el ENTRYPOINT y no en JAVA_TOOL_OPTIONS: un JAVA_TOOL_OPTIONS
# puesto en el entorno del contenedor no lo quita.
ENTRYPOINT ["java", "--enable-native-access=ALL-UNNAMED", "-XX:+ExitOnOutOfMemoryError", "-jar", "/app/app.jar"]
