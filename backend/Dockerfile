# El jar es independiente de la arquitectura: se compila en la plataforma del
# runner para no ejecutar Gradle bajo QEMU al publicar la imagen ARM64.
FROM --platform=$BUILDPLATFORM eclipse-temurin:25-jdk-alpine AS build
WORKDIR /src
COPY gradlew settings.gradle.kts build.gradle.kts gradle.properties ./
COPY gradle ./gradle
RUN ./gradlew --no-daemon --version
COPY src ./src
COPY openapi ./openapi
RUN ./gradlew --no-daemon assemble -x test

FROM eclipse-temurin:25-jre-alpine
ARG PU_COMMIT_SHA=""
ENV PU_COMMIT_SHA=${PU_COMMIT_SHA} \
    JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75 -XX:+UseSerialGC -Djava.awt.headless=true -Dlogback.configurationFile=logback-prod.xml"
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
# uid/gid 1000 coincide con el usuario `node` de la imagen del servidor Node,
# que escribe los avatares en el volumen compartido con modo 0600: el backend
# necesita el mismo uid para leerlos y borrarlos.
RUN mkdir -p /data/avatars && chown -R 1000:1000 /data
USER 1000:1000
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/health/readiness || exit 1
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
