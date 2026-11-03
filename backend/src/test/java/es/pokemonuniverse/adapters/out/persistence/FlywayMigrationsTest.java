package es.pokemonuniverse.adapters.out.persistence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.application.health.SchemaVersionReader;
import io.micronaut.jdbc.DataSourceResolver;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.postgresql.ds.PGSimpleDataSource;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * Flyway es el único dueño del esquema. Contenedor propio (no el de Test Resources) porque hacen falta varias BD y
 * {@code pg_dump}, que no está en el host: se ejecuta dentro del contenedor.
 *
 * <p>La BD «de Prisma» se crea ejecutando, en orden, los {@code migration.sql} de {@code apps/server/prisma/migrations}:
 * es exactamente el SQL que {@code prisma migrate deploy} aplicó en producción (Prisma solo añade la contabilidad de
 * {@code _prisma_migrations}, que aquí se reproduce). No se usa {@code npx prisma}: el CI del backend solo instala Java.
 */
class FlywayMigrationsTest {

  private static final Path PRISMA_MIGRATIONS = Path.of("..", "apps", "server", "prisma", "migrations");
  private static final AtomicInteger SEQ = new AtomicInteger();
  private static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");

  @BeforeAll
  static void start() {
    POSTGRES.start();
  }

  @AfterAll
  static void stop() {
    POSTGRES.stop();
  }

  @Test
  void flywaySchemaEqualsThePrismaSchema() throws Exception {
    var flyway = createDatabase();
    FlywayMigrations.migrate(dataSource(flyway));
    var prisma = createDatabase();
    applyPrismaMigrations(dataSource(prisma));

    var expected = schema(prisma);
    assertTrue(expected.size() > 100, "pg_dump casi vacío: " + expected);
    assertEquals(String.join("\n\n", expected), String.join("\n\n", schema(flyway)));
  }

  @Test
  void emptyDatabaseGetsTheWholeSchemaAndVersion1() throws Exception {
    var db = createDatabase();
    FlywayMigrations.migrate(dataSource(db));

    assertEquals(List.of("1|1|baseline|SQL|true"), history(db));
    assertTrue(schema(db).stream().anyMatch(s -> s.startsWith("CREATE TABLE public.\"User\" (")));
  }

  @Test
  void prismaDatabaseWithBaselineStartsUnchanged() throws Exception {
    var db = createDatabase();
    applyPrismaMigrations(dataSource(db));
    FlywayMigrations.migrate(dataSource(db));
    var historyBefore = history(db);
    var schemaBefore = schema(db);

    FlywayMigrations.migrate(dataSource(db));

    assertEquals(historyBefore, history(db));
    assertEquals(schemaBefore, schema(db));
  }

  @Test
  void prismaDatabaseWithoutHistoryIsBaselinedWithoutRunningV1() throws Exception {
    var db = createDatabase();
    applyPrismaMigrations(dataSource(db));
    var schemaBefore = schema(db);

    FlywayMigrations.migrate(dataSource(db));

    assertEquals(List.of("1|1|<< Flyway Baseline >>|BASELINE|true"), history(db));
    assertEquals(schemaBefore, schema(db));
  }

  @Test
  void schemaVersionIsTheLatestSuccessfulFlywayMigration() throws Exception {
    var fresh = createDatabase();
    FlywayMigrations.migrate(dataSource(fresh));
    assertEquals("1 baseline", reader(fresh).latestMigration());

    var baselined = createDatabase();
    applyPrismaMigrations(dataSource(baselined));
    FlywayMigrations.migrate(dataSource(baselined));
    assertEquals("1 baseline", reader(baselined).latestMigration());

    execute(dataSource(fresh), "insert into flyway_schema_history (installed_rank, version, description, type, script,"
        + " installed_by, execution_time, success) values (2, '2', 'add x', 'SQL', 'V2__add_x.sql', 'test', 1, true),"
        + " (3, '3', 'broken', 'SQL', 'V3__broken.sql', 'test', 1, false)");
    assertEquals("2 add x", reader(fresh).latestMigration());
  }

  @Test
  void schemaVersionFallsBackToPrismaThenUnknown() throws Exception {
    var prisma = createDatabase();
    applyPrismaMigrations(dataSource(prisma));
    assertEquals(lastPrismaMigration(), reader(prisma).latestMigration());

    assertEquals(SchemaVersionReader.UNKNOWN, reader(createDatabase()).latestMigration());
  }

  private static SchemaVersionReader reader(String db) {
    return new JdbcSchemaVersionReader(dataSource(db), DataSourceResolver.DEFAULT);
  }

  private static String createDatabase() throws SQLException {
    var name = "db_" + SEQ.incrementAndGet();
    execute(dataSource(POSTGRES.getDatabaseName()), "create database " + name);
    return name;
  }

  private static DataSource dataSource(String db) {
    var ds = new PGSimpleDataSource();
    ds.setServerNames(new String[] {POSTGRES.getHost()});
    ds.setPortNumbers(new int[] {POSTGRES.getMappedPort(PostgreSQLContainer.POSTGRESQL_PORT)});
    ds.setDatabaseName(db);
    ds.setUser(POSTGRES.getUsername());
    ds.setPassword(POSTGRES.getPassword());
    return ds;
  }

  private static List<Path> prismaMigrationScripts() throws IOException {
    assertTrue(Files.isDirectory(PRISMA_MIGRATIONS), "No existe " + PRISMA_MIGRATIONS.toAbsolutePath());
    try (var dirs = Files.list(PRISMA_MIGRATIONS)) {
      var scripts = dirs.filter(Files::isDirectory).sorted().map(d -> d.resolve("migration.sql")).toList();
      assertTrue(scripts.size() >= 16, "Faltan migraciones de Prisma: " + scripts);
      return scripts;
    }
  }

  private static String lastPrismaMigration() throws IOException {
    var scripts = prismaMigrationScripts();
    return scripts.getLast().getParent().getFileName().toString();
  }

  /** Como {@code prisma migrate deploy}: cada {@code migration.sql} en orden y su fila en {@code _prisma_migrations}. */
  private static void applyPrismaMigrations(DataSource ds) throws IOException, SQLException {
    execute(ds, """
        CREATE TABLE "_prisma_migrations" (
          "id" VARCHAR(36) PRIMARY KEY NOT NULL, "checksum" VARCHAR(64) NOT NULL, "finished_at" TIMESTAMPTZ,
          "migration_name" VARCHAR(255) NOT NULL, "logs" TEXT, "rolled_back_at" TIMESTAMPTZ,
          "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(), "applied_steps_count" INTEGER NOT NULL DEFAULT 0)""");
    int i = 0;
    for (var script : prismaMigrationScripts()) {
      execute(ds, Files.readString(script));
      execute(ds, "insert into \"_prisma_migrations\" (id, checksum, finished_at, migration_name, applied_steps_count)"
          + " values ('m" + i + "', 'x', timestamptz '2026-01-01' + interval '" + i + " minutes', '"
          + script.getParent().getFileName() + "', 1)");
      i++;
    }
  }

  private static void execute(DataSource ds, String sql) throws SQLException {
    try (var c = ds.getConnection(); var st = c.createStatement()) {
      st.execute(sql);
    }
  }

  private static List<String> history(String db) throws SQLException {
    var rows = new ArrayList<String>();
    try (var c = dataSource(db).getConnection(); var st = c.createStatement();
        var rs = st.executeQuery("select installed_rank, version, description, type, success"
            + " from flyway_schema_history order by installed_rank")) {
      while (rs.next()) {
        rows.add(rs.getInt(1) + "|" + rs.getString(2) + "|" + rs.getString(3) + "|" + rs.getString(4) + "|"
            + rs.getBoolean(5));
      }
    }
    return rows;
  }

  /**
   * {@code pg_dump --schema-only} normalizado: sin comentarios, {@code SET}, {@code set_config}, {@code \restrict}
   * (pg_dump ≥ 17.6 pone un token aleatorio), propietarios ni permisos, y con las sentencias ordenadas (el orden de
   * las columnas dentro de cada sentencia se conserva). Sin {@code _prisma_migrations} ni {@code flyway_schema_history}.
   */
  private static List<String> schema(String db) throws IOException, InterruptedException {
    var dump = POSTGRES.execInContainer("pg_dump", "--schema-only", "--no-owner", "--no-acl",
        "--exclude-table=public._prisma_migrations", "--exclude-table=public.flyway_schema_history",
        "-U", POSTGRES.getUsername(), db);
    assertEquals(0, dump.getExitCode(), dump.getStderr());
    var lines = dump.getStdout().lines()
        .filter(l -> !l.startsWith("--") && !l.startsWith("SET ") && !l.startsWith("SELECT pg_catalog.set_config")
            && !l.startsWith("\\restrict") && !l.startsWith("\\unrestrict") && !l.isBlank())
        .collect(Collectors.joining("\n", "", "\n"));
    return Arrays.stream(lines.split(";\n")).map(String::strip).filter(s -> !s.isEmpty()).sorted().toList();
  }
}
