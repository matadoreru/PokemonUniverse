package es.pokemonuniverse.adapters.out.persistence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
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
import org.flywaydb.core.api.configuration.FluentConfiguration;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.postgresql.ds.PGSimpleDataSource;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * Flyway es el único dueño del esquema. Contenedor propio (no el de Test Resources) porque hacen falta varias BD y
 * {@code pg_dump}, que no está en el host: se ejecuta dentro del contenedor.
 *
 * <p>La BD «de Prisma» se crea ejecutando, en orden, los {@code migration.sql} de
 * {@code src/test/resources/db/prisma-migrations} (copia congelada de las migraciones del antiguo servidor Node): es
 * exactamente el SQL que {@code prisma migrate deploy} aplicó en producción (Prisma solo añade la contabilidad de
 * {@code _prisma_migrations}, que aquí se reproduce). No se usa {@code npx prisma}: el CI del backend solo instala Java.
 */
class FlywayMigrationsTest {

  private static final Path PRISMA_MIGRATIONS = Path.of("src", "test", "resources", "db", "prisma-migrations");
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
    migrateToV1(dataSource(flyway));
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

    assertEquals("1|1|baseline|SQL|true", history(db).getFirst());
    assertTrue(history(db).stream().allMatch(r -> r.endsWith("|true")), history(db).toString());
    assertTrue(schema(db).stream().anyMatch(s -> s.startsWith("CREATE TABLE public.\"User\" (")));
  }

  /**
   * El binario nativo da a Flyway las migraciones ya listadas ({@link NativeMigrationResources}) en vez de dejarle
   * escanear el classpath. Flyway debe verlas igual: mismas versiones y mismos checksums, en los dos sentidos (una BD
   * migrada por el escáner valida con el proveedor y al revés) y sin aplicar nada de más.
   */
  @Test
  void nativeResourceProviderIsInterchangeableWithTheClasspathScanner() throws Exception {
    var directory = Path.of(FlywayMigrationsTest.class.getClassLoader().getResource(NativeMigrationResources.LOCATION).toURI());

    var scanned = createDatabase();
    FlywayMigrations.migrate(dataSource(scanned));
    var historyBefore = history(scanned);
    var withProvider = FlywayMigrations.configure(dataSource(scanned))
        .resourceProvider(NativeMigrationResources.load(directory)).load();
    withProvider.validate();
    assertEquals(0, withProvider.migrate().migrationsExecuted);
    assertEquals(historyBefore, history(scanned));

    var provided = createDatabase();
    var result = FlywayMigrations.configure(dataSource(provided))
        .resourceProvider(NativeMigrationResources.load(directory)).load().migrate();
    assertEquals(historyBefore.size(), result.migrationsExecuted);
    assertEquals(historyBefore, history(provided));
    assertEquals(String.join("\n\n", schema(scanned)), String.join("\n\n", schema(provided)));
    var scanner = FlywayMigrations.configure(dataSource(provided)).load();
    scanner.validate();
    assertEquals(0, scanner.migrate().migrationsExecuted);
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

    migrateToV1(dataSource(db));

    assertEquals(List.of("1|1|<< Flyway Baseline >>|BASELINE|true"), history(db));
    assertEquals(schemaBefore, schema(db));
  }

  /**
   * Invariante que sobrevive a las {@code V2__…} reales: una BD vacía migrada hasta la última versión y una BD de
   * Prisma (baseline 1) migrada hasta la última quedan iguales. La sonda {@code db/testmigration/V9999__probe.sql}
   * (solo de test) garantiza que siempre hay al menos una migración después de V1.
   */
  @Test
  void freshAndPrismaDatabasesConvergeAfterLaterMigrations() throws Exception {
    var fresh = createDatabase();
    withProbe(dataSource(fresh)).load().migrate();
    var prisma = createDatabase();
    applyPrismaMigrations(dataSource(prisma));
    withProbe(dataSource(prisma)).load().migrate();

    assertEquals("9999|probe|SQL|true", lastHistoryRow(fresh));
    assertEquals("9999|probe|SQL|true", lastHistoryRow(prisma));
    assertEquals(String.join("\n\n", schema(fresh)), String.join("\n\n", schema(prisma)));
  }

  /** V16 borra el historial de Prisma de una BD de Prisma (baseline 1) y no falla en una BD creada por Flyway. */
  @Test
  void v16DropsThePrismaHistory() throws Exception {
    var prisma = createDatabase();
    applyPrismaMigrations(dataSource(prisma));
    FlywayMigrations.configure(dataSource(prisma)).target("15").load().migrate();
    assertTrue(tableExists(prisma, "_prisma_migrations"));

    FlywayMigrations.migrate(dataSource(prisma));
    assertFalse(tableExists(prisma, "_prisma_migrations"));

    var fresh = createDatabase();
    FlywayMigrations.migrate(dataSource(fresh));
    assertTrue(history(fresh).stream().anyMatch(r -> r.startsWith("16|16|borrar prisma migrations|SQL|true")),
        history(fresh).toString());
  }

  @Test
  void schemaVersionIsTheLatestSuccessfulFlywayMigration() throws Exception {
    var fresh = createDatabase();
    migrateToV1(dataSource(fresh));
    assertEquals("1 baseline", reader(fresh).latestMigration());

    var baselined = createDatabase();
    applyPrismaMigrations(dataSource(baselined));
    migrateToV1(dataSource(baselined));
    assertEquals("1 baseline", reader(baselined).latestMigration());

    execute(dataSource(fresh), "insert into flyway_schema_history (installed_rank, version, description, type, script,"
        + " installed_by, execution_time, success) values (2, '2', 'add x', 'SQL', 'V2__add_x.sql', 'test', 1, true),"
        + " (3, '3', 'broken', 'SQL', 'V3__broken.sql', 'test', 1, false)");
    assertEquals("2 add x", reader(fresh).latestMigration());
  }

  /** Sin historial de Flyway la versión es {@code unknown}, aunque quede el historial de Prisma: ya no se lee. */
  @Test
  void schemaVersionIsUnknownWithoutFlywayHistory() throws Exception {
    var prisma = createDatabase();
    applyPrismaMigrations(dataSource(prisma));
    assertEquals(SchemaVersionReader.UNKNOWN, reader(prisma).latestMigration());

    assertEquals(SchemaVersionReader.UNKNOWN, reader(createDatabase()).latestMigration());
  }

  /** V2 pasa los avatares predefinidos guardados a la inicial y desde entonces solo admite DEFAULT o CUSTOM. */
  @Test
  void v2TurnsPresetAvatarsIntoDefaultAndForbidsThem() throws Exception {
    var db = createDatabase();
    migrateToV1(dataSource(db));
    execute(dataSource(db), "insert into \"User\" (id, username, email, \"passwordHash\", \"updatedAt\", \"avatarType\","
        + " \"avatarValue\", \"avatarVersion\") values ('u1', 'ana', 'a@b.c', 'x', now(), 'PRESET', 'trainer-aqua', 3),"
        + " ('u2', 'eva', 'e@b.c', 'x', now(), 'CUSTOM', '0123456789abcdef0123456789abcdef0123.webp', 2)");

    FlywayMigrations.migrate(dataSource(db));

    var rows = new ArrayList<String>();
    try (var c = dataSource(db).getConnection(); var st = c.createStatement();
        var rs = st.executeQuery("select id, \"avatarType\", \"avatarValue\", \"avatarVersion\" from \"User\" order by id")) {
      while (rs.next()) rows.add(rs.getString(1) + "|" + rs.getString(2) + "|" + rs.getString(3) + "|" + rs.getInt(4));
    }
    assertEquals(List.of("u1|DEFAULT|null|3", "u2|CUSTOM|0123456789abcdef0123456789abcdef0123.webp|2"), rows);
    var rejected = assertThrows(SQLException.class, () -> execute(dataSource(db),
        "update \"User\" set \"avatarType\" = 'PRESET', \"avatarValue\" = 'trainer-aqua' where id = 'u2'"));
    assertEquals("23514", rejected.getSQLState(), "viola el CHECK de avatarType");
  }

  /**
   * V3 añade la experiencia y la calcula con el historial: solo partidas COMPLETED, 20 por jugar y 30/20/10 por quedar
   * entre los tres primeros con al menos dos jugadores (la misma tabla que {@code Experience.xpForGame}).
   */
  @Test
  void v3BackfillsExperienceFromCompletedGames() throws Exception {
    var db = createDatabase();
    FlywayMigrations.configure(dataSource(db)).target("2").load().migrate();
    execute(dataSource(db), "insert into \"User\" (id, username, email, \"passwordHash\", \"updatedAt\") values"
        + " ('u1', 'ana', 'a@b.c', 'x', now()), ('u2', 'eva', 'e@b.c', 'x', now()), ('u3', 'leo', 'l@b.c', 'x', now())");
    execute(dataSource(db), "insert into \"UserStats\" (\"userId\") values ('u1'), ('u2'), ('u3')");
    execute(dataSource(db), "insert into \"GameHistory\" (id, \"roomCode\", \"gameId\", \"playerCount\", config,"
        + " \"startedAt\", \"resultId\", status) values"
        + " ('g1', 'ABCDEF', 'higher-lower', 9, '{}', now(), 'r1', 'COMPLETED'),"
        + " ('g2', 'ABCDEF', 'higher-lower', 1, '{}', now(), 'r2', 'COMPLETED'),"
        + " ('g3', 'ABCDEF', 'higher-lower', 2, '{}', now(), 'r3', 'ABANDONED')");
    execute(dataSource(db), "insert into \"PlayerGameResult\" (id, \"historyId\", \"userId\", \"displayName\","
        + " \"position\", points, metrics) values"
        + " ('p1', 'g1', 'u1', 'ana', 1, 5, '{}'), ('p2', 'g1', 'u2', 'eva', 2, 3, '{}'),"
        + " ('p3', 'g1', null, 'Invitado', 3, 1, '{}'), ('p4', 'g1', 'u3', 'leo', 4, 0, '{}'),"
        + " ('p5', 'g2', 'u1', 'ana', 1, 2, '{}'),"
        + " ('p6', 'g3', 'u2', 'eva', 1, 9, '{}'), ('p7', 'g3', 'u3', 'leo', 2, 0, '{}')");

    FlywayMigrations.migrate(dataSource(db));

    var rows = new ArrayList<String>();
    try (var c = dataSource(db).getConnection(); var st = c.createStatement();
        var rs = st.executeQuery("select \"userId\", xp from \"UserStats\" order by \"userId\"")) {
      while (rs.next()) rows.add(rs.getString(1) + "|" + rs.getInt(2));
    }
    // u1: 50 (1.º de 4) + 20 (en solitario); u2: 40 (2.º); u3: 20 (4.º). La partida abandonada no cuenta.
    assertEquals(List.of("u1|70", "u2|40", "u3|20"), rows);
  }

  /** Los ajustes de producción detenidos en V1:las comprobaciones de V1 no dependen de las {@code V2__…} futuras. */
  private static void migrateToV1(DataSource ds) {
    FlywayMigrations.configure(ds).target("1").load().migrate();
  }

  private static FluentConfiguration withProbe(DataSource ds) {
    return FlywayMigrations.configure(ds).locations("classpath:db/migration", "classpath:db/testmigration");
  }

  private static String lastHistoryRow(String db) throws SQLException {
    var last = history(db).getLast();
    return last.substring(last.indexOf('|') + 1);
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

  private static boolean tableExists(String db, String table) throws SQLException {
    try (var c = dataSource(db).getConnection(); var st = c.createStatement();
        var rs = st.executeQuery("select to_regclass('public.\"" + table + "\"')")) {
      return rs.next() && rs.getString(1) != null;
    }
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
