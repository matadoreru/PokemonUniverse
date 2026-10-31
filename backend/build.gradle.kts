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
    incremental(true)
    annotations("es.pokemonuniverse.*")
  }
}

dependencies {
  implementation("io.micronaut:micronaut-http-server-netty")
  implementation("io.micronaut:micronaut-management")
  implementation("io.micronaut.serde:micronaut-serde-jackson")
  runtimeOnly("ch.qos.logback:logback-classic")
  runtimeOnly("org.yaml:snakeyaml")

  testImplementation("io.micronaut:micronaut-http-client")
}
