plugins {
  alias(libs.plugins.micronaut.application)
  alias(libs.plugins.micronaut.test.resources)
}

version = "0.1.0"
group = "es.pokemonuniverse"

repositories {
  mavenCentral()
}

java {
  toolchain {
    languageVersion = JavaLanguageVersion.of(25)
  }
}

application {
  mainClass = "es.pokemonuniverse.Application"
}

micronaut {
  version(libs.versions.micronaut.get())
  runtime("netty")
  testRuntime("junit5")
  processing {
    incremental(false)
    annotations("es.pokemonuniverse.*")
  }
}

dependencies {
  implementation("io.micronaut:micronaut-http-server-netty")
  implementation("io.micronaut:micronaut-management")
  implementation("io.micronaut:micronaut-websocket")
  implementation("io.micronaut.micrometer:micronaut-micrometer-core")
  implementation("io.micronaut.micrometer:micronaut-micrometer-registry-prometheus")
  implementation("io.micronaut.serde:micronaut-serde-jackson")
  annotationProcessor("io.micronaut.data:micronaut-data-processor")
  annotationProcessor("io.micronaut.validation:micronaut-validation-processor")
  annotationProcessor("io.micronaut.openapi:micronaut-openapi")
  compileOnly("io.micronaut.openapi:micronaut-openapi-annotations")
  testCompileOnly("io.micronaut.openapi:micronaut-openapi-annotations")
  implementation("io.micronaut.validation:micronaut-validation")
  implementation("io.micronaut.data:micronaut-data-hibernate-jpa")
  implementation("io.micronaut.sql:micronaut-jdbc-hikari")
  implementation("com.nimbusds:nimbus-jose-jwt:10.10")
  implementation("at.favre.lib:bcrypt:0.10.2")
  implementation("org.eclipse.angus:angus-mail:2.0.3")
  // Misma ICU que Node (process.versions.icu): Collations replica localeCompare, espacios y guiones incluidos.
  implementation("com.ibm.icu:icu4j:78.3")
  // Avatares: lectura en Java puro (JPEG robusto con CMYK/ICC y WebP; PNG con el lector del JDK) y escritura WebP
  // con la libwebp nativa empaquetada (Linux x86_64/aarch64, también sobre musl).
  implementation(libs.twelvemonkeys.imageio.jpeg)
  implementation(libs.twelvemonkeys.imageio.webp)
  implementation(libs.webp.imageio)
  implementation("io.micronaut.flyway:micronaut-flyway")
  runtimeOnly("org.flywaydb:flyway-database-postgresql")
  runtimeOnly("org.postgresql:postgresql")
  runtimeOnly("ch.qos.logback:logback-classic")
  runtimeOnly("net.logstash.logback:logstash-logback-encoder:8.1")
  runtimeOnly("org.yaml:snakeyaml")

  testImplementation("io.micronaut:micronaut-http-client")
  testImplementation("org.yaml:snakeyaml")
  // ListAppender: los tests que comprueban un WARN leen los eventos de logback.
  testImplementation("ch.qos.logback:logback-classic")
  // Paridad de esquema Flyway/Prisma y arranque de FlywayMigrations: contenedor propio (pg_dump dentro) y varias BD.
  testImplementation("org.testcontainers:testcontainers-postgresql")
  testImplementation("org.postgresql:postgresql")
  testResourcesService("org.postgresql:postgresql")
}

tasks.named<JavaExec>("run") {
  jvmArgs("--enable-native-access=ALL-UNNAMED")
}

tasks.named<JavaCompile>("compileJava") {
  options.compilerArgs.addAll(listOf("-Amicronaut.openapi.views.spec=swagger-ui.enabled=true", "-Amicronaut.openapi.filename=pokemon-universe"))
}

// Los controladores de prueba no deben generar su propia especificación (taparía a la principal en el classpath).
tasks.named<JavaCompile>("compileTestJava") {
  options.compilerArgs.add("-Amicronaut.openapi.enabled=false")
}

val generatedSpec = layout.buildDirectory.file("classes/java/main/META-INF/swagger/pokemon-universe.yml")
val committedSpec = layout.projectDirectory.file("openapi/pokemon-universe.yml")

tasks.register<Copy>("syncOpenApi") {
  group = "documentation"
  description = "Copia la especificación OpenAPI generada a openapi/pokemon-universe.yml"
  dependsOn("classes")
  from(generatedSpec)
  into(layout.projectDirectory.dir("openapi"))
  rename { "pokemon-universe.yml" }
}

abstract class VerifyOpenApi : DefaultTask() {
  @get:InputFile
  abstract val generated: RegularFileProperty

  @get:Optional
  @get:InputFile
  abstract val committed: RegularFileProperty

  @TaskAction
  fun verify() {
    val copy = committed.orNull?.asFile
    if (copy == null || !copy.exists() || copy.readText() != generated.get().asFile.readText()) {
      throw GradleException("La especificación OpenAPI commiteada no coincide con la generada. Ejecuta ./gradlew syncOpenApi")
    }
  }
}

tasks.register<VerifyOpenApi>("verifyOpenApi") {
  group = "verification"
  description = "Falla si openapi/pokemon-universe.yml difiere de la especificación generada"
  dependsOn("classes")
  mustRunAfter("syncOpenApi")
  generated = generatedSpec
  committed = committedSpec
}

tasks.named("check") { dependsOn("verifyOpenApi") }

// Reenvía -Dupdate (ConfigMessagesSnapshotTest reescribe su instantánea con "true").
val updateSnapshots = providers.systemProperty("update").orElse("false")
tasks.named<Test>("test") {
  // webp-imageio carga su libwebp con System.load (acceso nativo restringido desde Java 24).
  jvmArgs("--enable-native-access=ALL-UNNAMED")
  systemProperty("update", updateSnapshots.get())
}
