package es.pokemonuniverse.domain.achievements;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.adapters.out.resources.ClasspathGameRegistryLoader;
import es.pokemonuniverse.domain.game.GameManifest;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.GameStanding;
import io.micronaut.serde.ObjectMapper;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Catálogo de 52 logros sobre los manifiestos reales de {@code registry.json}; cada condición se prueba en su borde. */
class AchievementCatalogTest {

  private static final List<GameManifest> MANIFESTS =
      ClasspathGameRegistryLoader.loadFromClasspath(ObjectMapper.getDefault()).list();
  private static final AchievementCatalog CATALOG = AchievementCatalog.of(MANIFESTS);
  private static final Instant NOON = Instant.parse("2026-11-06T12:00:00Z");

  /** Hechos de una partida de un jugador ({@code p1}) con valores neutros; cada test cambia lo que prueba. */
  private static final class Facts {
    String gameId = "pokemon-trivia";
    String mode = null;
    List<GameStanding> standings = new ArrayList<>(List.of(standing("p1", 1, 10, Map.of())));
    boolean ranked = true;
    boolean won = false;
    int gamesPlayed = 0;
    int gamesWon = 0;
    int xp = 0;
    Map<String, Integer> winsByGame = Map.of();
    int sameGameStreak = 1;
    Instant endedAt = NOON;

    Facts game(String id, String value) {
      gameId = id;
      mode = value;
      return this;
    }

    Facts stats(Map<String, Number> stats) {
      var first = standings.getFirst();
      standings.set(0, standing(first.playerId(), first.position(), first.points(), stats));
      return this;
    }

    AchievementFacts build() {
      var results = ranked ? new GameResults(null, standings) : GameResults.unranked(standings);
      return AchievementFacts.of(gameId, mode, standings.getFirst(), results, won, gamesPlayed, gamesWon, xp,
          winsByGame, sameGameStreak, endedAt);
    }

    List<String> met() {
      return CATALOG.met(build());
    }
  }

  private static GameStanding standing(String id, int position, int points, Map<String, Number> stats) {
    return new GameStanding(id, position, points, null, stats);
  }

  @Test
  void hasFiftyTwoUniqueIds() {
    var all = CATALOG.all();
    assertEquals(52, all.size());
    assertEquals(52, new HashSet<>(all.stream().map(Achievement::id).toList()).size());
    assertEquals(10, all.stream().filter(a -> a.family() == AchievementFamily.GENERAL).count());
    assertEquals(38, all.stream().filter(a -> a.family() == AchievementFamily.GAME).count());
    assertEquals(4, all.stream().filter(a -> a.family() == AchievementFamily.SECRET).count());
    assertEquals("general.first-game", all.getFirst().id());
    assertEquals("secret.4", all.getLast().id());
    assertTrue(CATALOG.byId("secret.2").isPresent());
    assertTrue(CATALOG.byId("no-existe").isEmpty());
  }

  @Test
  void oneWinPerManifest() {
    var wins = CATALOG.all().stream().filter(a -> a.id().endsWith(".win")).toList();
    assertEquals(32, wins.size());
    assertEquals(MANIFESTS.stream().map(m -> "game." + m.id() + ".win").toList(),
        wins.stream().map(Achievement::id).toList());
    for (var manifest : MANIFESTS) {
      var win = CATALOG.byId("game." + manifest.id() + ".win").orElseThrow();
      assertEquals("Gana en " + manifest.name(), win.name());
      assertEquals("Gana una partida de " + manifest.name() + ".", win.description());
      assertEquals(manifest.id(), win.gameId());
      assertEquals(AchievementFamily.GAME, win.family());
    }
    // La victoria va antes que el específico del mismo juego.
    var ids = CATALOG.all().stream().map(Achievement::id).toList();
    assertEquals(ids.indexOf("game.higher-lower.win") + 1, ids.indexOf("game.higher-lower.endless-10"));
  }

  @Test
  void secretIdsAreNeutral() {
    assertEquals(List.of("secret.1", "secret.2", "secret.3", "secret.4"), CATALOG.all().stream()
        .filter(a -> a.family() == AchievementFamily.SECRET).map(Achievement::id).toList());
  }

  @Test
  void generalThresholds() {
    var facts = new Facts();
    facts.gamesPlayed = 9;
    assertFalse(facts.met().contains("general.games-10"));
    assertTrue(facts.met().contains("general.first-game"));
    facts.gamesPlayed = 10;
    assertTrue(facts.met().contains("general.games-10"));
    assertFalse(facts.met().contains("general.games-50"));

    facts.gamesWon = 0;
    assertFalse(facts.met().contains("general.first-win"));
    facts.gamesWon = 49;
    assertTrue(facts.met().contains("general.wins-10"));
    assertFalse(facts.met().contains("general.wins-50"));
    facts.gamesWon = 50;
    assertTrue(facts.met().contains("general.wins-50"));

    facts.xp = 699;
    assertFalse(facts.met().contains("general.level-5"));
    facts.xp = 700;
    assertTrue(facts.met().contains("general.level-5"));
    assertFalse(facts.met().contains("general.level-10"));
    facts.xp = 10_450;
    assertTrue(facts.met().contains("general.level-20"));
  }

  @Test
  void winsAreRetroactiveAcrossGames() {
    var facts = new Facts();
    facts.winsByGame = Map.of("pokemon-bingo", 1, "type-chain", 0);
    var met = facts.met();
    assertTrue(met.contains("game.pokemon-bingo.win"));
    assertFalse(met.contains("game.type-chain.win"));
    assertFalse(met.contains("game.pokemon-trivia.win"));
  }

  private static void assertModeSpecific(String gameId, String mode, String metric, int threshold, String id) {
    assertTrue(new Facts().game(gameId, mode).stats(Map.of(metric, threshold)).met().contains(id), id);
    assertFalse(new Facts().game(gameId, "CLASSIC").stats(Map.of(metric, threshold)).met().contains(id), id);
    assertFalse(new Facts().game(gameId, null).stats(Map.of(metric, threshold)).met().contains(id), id);
    assertFalse(new Facts().game(gameId, mode).stats(Map.of(metric, threshold - 1)).met().contains(id), id);
  }

  @Test
  void modeSpecificNeedTheirMode() {
    assertModeSpecific("higher-lower", "ENDLESS", "endlessBestStreak", 10, "game.higher-lower.endless-10");
    assertModeSpecific("shiny-vote", "SURVIVAL", "correctVotes", 10, "game.shiny-vote.survival-10");
    assertModeSpecific("learnset-guess", "MANUAL_REVEAL", "initialSolves", 1, "game.learnset-guess.first-group");
    assertModeSpecific("type-duel", "COOP", "groupTotal", 20, "game.type-duel.coop-20");
  }

  @Test
  void bullseyeAndDisguiseInAnyMode() {
    for (var mode : java.util.Arrays.asList(null, "CLASSIC", "ONE_WORD")) {
      assertTrue(new Facts().game("pokedex-distance", mode).stats(Map.of("exactHits", 1)).met()
          .contains("game.pokedex-distance.bullseye"));
      assertTrue(new Facts().game("pokemon-impostor", mode).stats(Map.of("wonAsImpostor", 1)).met()
          .contains("game.pokemon-impostor.disguise"));
    }
    assertFalse(new Facts().game("pokedex-distance", null).stats(Map.of("exactHits", 0)).met()
        .contains("game.pokedex-distance.bullseye"));
    assertFalse(new Facts().game("pokemon-impostor", null).stats(Map.of("wonAsImpostor", 0)).met()
        .contains("game.pokemon-impostor.disguise"));
  }

  @Test
  void specificOnlyForItsGame() {
    var met = new Facts().game("pokemon-trivia", null)
        .stats(Map.of("exactHits", 1, "wonAsImpostor", 1, "endlessBestStreak", 50)).met();
    assertFalse(met.contains("game.pokedex-distance.bullseye"));
    assertFalse(met.contains("game.pokemon-impostor.disguise"));
    var endless = new Facts().game("shiny-vote", "ENDLESS").stats(Map.of("endlessBestStreak", 50)).met();
    assertFalse(endless.contains("game.higher-lower.endless-10"));
  }

  @Test
  void photoFinish() {
    var tie = new Facts();
    tie.standings.add(standing("p2", 1, 10, Map.of()));
    tie.standings.add(standing("p3", 3, 2, Map.of()));
    assertTrue(tie.met().contains("secret.1"));

    var alone = new Facts();
    assertFalse(alone.met().contains("secret.1"));

    var noTie = new Facts();
    noTie.standings.add(standing("p2", 2, 5, Map.of()));
    assertFalse(noTie.met().contains("secret.1"));

    var impostor = new Facts().game("pokemon-impostor", "CLASSIC");
    impostor.standings.add(standing("p2", 1, 10, Map.of()));
    impostor.standings.add(standing("p3", 2, 0, Map.of()));
    assertFalse(impostor.met().contains("secret.1"));

    var coop = new Facts().game("type-duel", "COOP");
    coop.ranked = false;
    coop.standings.add(standing("p2", 1, 10, Map.of()));
    assertFalse(coop.met().contains("secret.1"));

    var classicDuel = new Facts().game("type-duel", "CLASSIC");
    classicDuel.standings.add(standing("p2", 1, 10, Map.of()));
    assertTrue(classicDuel.met().contains("secret.1"));
  }

  @Test
  void loyalNeedsTenSameGame() {
    var nine = new Facts();
    nine.sameGameStreak = 9;
    assertFalse(nine.met().contains("secret.2"));

    var ten = new Facts();
    ten.sameGameStreak = 10;
    assertTrue(ten.met().contains("secret.2"));

    var more = new Facts();
    more.sameGameStreak = 25;
    assertTrue(more.met().contains("secret.2"));
  }

  private static boolean nightOwlAt(String instant) {
    var facts = new Facts();
    facts.endedAt = Instant.parse(instant);
    return facts.met().contains("secret.3");
  }

  @Test
  void nightOwlMadridTime() {
    // Noviembre: Madrid va en UTC+1.
    assertFalse(nightOwlAt("2026-11-06T01:59:00Z"));
    assertTrue(nightOwlAt("2026-11-06T02:00:00Z"));
    assertTrue(nightOwlAt("2026-11-06T03:59:00Z"));
    assertFalse(nightOwlAt("2026-11-06T04:00:00Z"));
    // Julio: Madrid va en UTC+2; las 01:30 UTC son las 03:30.
    assertTrue(nightOwlAt("2026-07-01T01:30:00Z"));
    assertFalse(nightOwlAt("2026-07-01T03:00:00Z"));
  }

  @Test
  void takingPart() {
    var four = new Facts();
    four.standings.set(0, standing("p1", 4, 0, Map.of()));
    four.standings.add(standing("p2", 1, 30, Map.of()));
    four.standings.add(standing("p3", 2, 20, Map.of()));
    four.standings.add(standing("p4", 3, 10, Map.of()));
    assertTrue(four.met().contains("secret.4"));

    var three = new Facts();
    three.standings.set(0, standing("p1", 3, 0, Map.of()));
    three.standings.add(standing("p2", 1, 30, Map.of()));
    three.standings.add(standing("p3", 2, 20, Map.of()));
    assertFalse(three.met().contains("secret.4"));

    var onePoint = new Facts();
    onePoint.standings.set(0, standing("p1", 4, 1, Map.of()));
    onePoint.standings.add(standing("p2", 1, 30, Map.of()));
    onePoint.standings.add(standing("p3", 2, 20, Map.of()));
    onePoint.standings.add(standing("p4", 3, 10, Map.of()));
    assertFalse(onePoint.met().contains("secret.4"));

    // Todos empatados a 0 en el primer puesto: no es «último».
    var allTied = new Facts();
    allTied.standings.set(0, standing("p1", 1, 0, Map.of()));
    for (var id : List.of("p2", "p3", "p4")) allTied.standings.add(standing(id, 1, 0, Map.of()));
    assertFalse(allTied.met().contains("secret.4"));

    var impostor = new Facts().game("pokemon-impostor", null);
    impostor.standings.set(0, standing("p1", 2, 0, Map.of()));
    for (var id : List.of("p2", "p3", "p4")) impostor.standings.add(standing(id, 1, 10, Map.of()));
    assertFalse(impostor.met().contains("secret.4"));
  }
}
