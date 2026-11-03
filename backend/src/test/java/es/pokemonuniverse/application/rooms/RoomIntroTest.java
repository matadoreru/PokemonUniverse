package es.pokemonuniverse.application.rooms;

import static es.pokemonuniverse.application.rooms.RoomTestKit.guest;
import static es.pokemonuniverse.application.rooms.RoomTestKit.json;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.identity.AuthUser;
import es.pokemonuniverse.domain.room.LiveRoom;
import es.pokemonuniverse.domain.room.RoomPhase;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Intro de partida (Fase 2, Task 5): los juegos con {@code introMs} en el manifiesto esperan en {@code GAME_STARTING}
 * hasta el plazo o hasta que todos los jugadores conectados pulsan «Saltar», solo la primera vez en la sesión.
 */
class RoomIntroTest {

  private static final long INTRO_MS = 10_000;
  private static final List<String> INTRO_GAMES = List.of("pokedex-distance", "shiny-vote", "pokemon-impostor",
      "higher-lower", "type-duel", "learnset-guess");

  private record Fixture(RoomTestKit kit, LiveRoom room, List<AuthUser> people) {
    String id(int index) {
      return people.get(index).id();
    }

    void skip(int index) {
      skip(index, room.game.resultId);
    }

    void skip(int index, String instanceId) {
      kit.manager.skipGameIntro(id(index), json("{\"gameInstanceId\":\"" + instanceId + "\"}"));
    }

    RoomView view() {
      return kit.manager.view(room, id(0));
    }
  }

  /** Sala con los manifiestos reales (con {@code introMs}) y {@code playerCount} jugadores en el lobby. */
  private static Fixture lobby(String gameId, int playerCount) {
    var kit = RoomTestKit.withIntro();
    var people = new ArrayList<AuthUser>();
    for (int index = 0; index < playerCount; index++) {
      people.add(guest("intro-p" + (index + 1), "Jugador " + (index + 1)));
    }
    var room = kit.room(8, people.toArray(AuthUser[]::new));
    kit.manager.selectGame(people.getFirst().id(), gameId);
    return new Fixture(kit, room, List.copyOf(people));
  }

  private static Fixture started(String gameId, int playerCount) {
    var fixture = lobby(gameId, playerCount);
    fixture.kit.startReady(fixture.room, fixture.id(0));
    return fixture;
  }

  @Test
  void introHoldsGameStartingUntilTheDeadline() {
    var f = started("pokedex-distance", 3);
    long startedAt = f.kit.time.now();
    var view = f.view();
    assertEquals(RoomPhase.GAME_STARTING, view.phase());
    assertNotNull(view.gameIntro());
    assertEquals(f.room.game.resultId, view.gameIntro().gameInstanceId());
    assertEquals(startedAt + INTRO_MS, view.gameIntro().endsAt());
    assertEquals(List.of(), view.gameIntro().skippedIds());
    assertEquals(0, view.game().get("roundNumber").getIntValue());
    // Durante la intro el motor no recibe acciones.
    var action = assertThrows(RoomException.class,
        () -> f.kit.manager.action(f.id(0), json("{\"type\":\"SELECT_POKEMON\",\"pokemonId\":\"1\"}")));
    assertEquals("La partida todavía no ha empezado.", action.getMessage());

    f.kit.time.advance(INTRO_MS - 1);
    assertEquals(RoomPhase.GAME_STARTING, f.room.phase);
    f.kit.time.advance(1);
    assertEquals(RoomPhase.ROUND_ACTIVE, f.room.phase);
    assertNull(f.view().gameIntro());
    assertEquals(1, f.view().game().get("roundNumber").getIntValue());
  }

  @Test
  void introStartsWhenEveryConnectedPlayerSkips() {
    var f = started("pokedex-distance", 3);
    f.skip(0);
    f.skip(1);
    assertEquals(RoomPhase.GAME_STARTING, f.room.phase);
    assertEquals(List.of(f.id(0), f.id(1)), f.view().gameIntro().skippedIds());
    // Pulsar dos veces no cuenta doble.
    f.skip(1);
    assertEquals(RoomPhase.GAME_STARTING, f.room.phase);
    f.skip(2);
    assertEquals(RoomPhase.ROUND_ACTIVE, f.room.phase);
    assertNull(f.room.intro);
    assertNull(f.room.introTimer);
    // El temporizador de la intro ya no hace nada al vencer.
    var round = f.view().game().get("roundNumber").getIntValue();
    f.kit.time.advance(INTRO_MS);
    assertEquals(round, f.view().game().get("roundNumber").getIntValue());
  }

  @Test
  void introSkipFromASpectatorIsRejected() {
    var f = started("pokedex-distance", 2);
    var late = guest("intro-late", "Tarde");
    f.kit.manager.join(late, "socket-intro-late", f.room.code);
    var error = assertThrows(RoomException.class,
        () -> f.kit.manager.skipGameIntro(late.id(), json("{\"gameInstanceId\":\"" + f.room.game.resultId + "\"}")));
    assertEquals("Solo los jugadores de la partida pueden saltar la intro.", error.getMessage());
    f.skip(0);
    f.skip(1);
    assertEquals(RoomPhase.ROUND_ACTIVE, f.room.phase);
  }

  @Test
  void introStartsWhenTheLastPendingPlayerDisconnects() {
    var f = started("pokedex-distance", 3);
    f.skip(0);
    f.skip(1);
    // En gracia de presencia el motor aún lo ve conectado, pero la intro solo cuenta a los CONNECTED.
    f.kit.manager.disconnect(f.id(2), "socket-" + f.id(2));
    assertEquals(RoomPhase.ROUND_ACTIVE, f.room.phase);
    assertNull(f.room.intro);
  }

  @Test
  void introSkipWithAStaleInstanceIsRejected() {
    var f = started("pokedex-distance", 2);
    var error = assertThrows(RoomException.class, () -> f.skip(0, "00000000-0000-4000-8000-000000000000"));
    assertEquals("El minijuego ya ha cambiado.", error.getMessage());
    assertEquals(List.of(), f.view().gameIntro().skippedIds());
    assertThrows(RoomException.class, () -> f.kit.manager.skipGameIntro(f.id(0), json("{\"gameInstanceId\":\"x\"}")));
    assertThrows(RoomException.class, () -> f.kit.manager.skipGameIntro(f.id(0),
        json("{\"gameInstanceId\":\"" + f.room.game.resultId + "\",\"extra\":1}")));
    // Sin intro (la partida ya empezó) también se rechaza.
    f.skip(0);
    f.skip(1);
    var instanceId = f.room.game.resultId;
    var late = assertThrows(RoomException.class, () -> f.skip(0, instanceId));
    assertEquals("El minijuego ya ha cambiado.", late.getMessage());
  }

  @Test
  void introOnlyOnceForTheSameGameInASession() {
    var f = lobby("higher-lower", 2);
    f.kit.manager.updateConfig(f.id(0), json(RoomTestKit.HIGHER_LOWER_1_ROUND));
    f.kit.startReady(f.room, f.id(0));
    assertNotNull(f.room.intro);
    f.skip(0);
    f.skip(1);
    f.kit.passDeadline(f.room);
    f.kit.passDeadline(f.room);
    assertEquals(RoomPhase.GAME_RESULTS, f.room.phase);

    // Siguiente partida de la misma sesión: arranca directa.
    f.kit.manager.returnLobby(f.id(0));
    f.kit.startReady(f.room, f.id(0));
    assertNull(f.room.intro);
    assertNull(f.view().gameIntro());
    assertEquals(RoomPhase.ROUND_ACTIVE, f.room.phase);

    // Una sesión nueva vuelve a mostrarla.
    f.kit.passDeadline(f.room);
    f.kit.passDeadline(f.room);
    assertEquals(RoomPhase.GAME_RESULTS, f.room.phase);
    f.kit.manager.endSession(f.id(0));
    f.kit.manager.returnLobby(f.id(0));
    assertEquals(RoomPhase.LOBBY, f.room.phase);
    f.kit.startReady(f.room, f.id(0));
    assertNotNull(f.room.intro);
    assertEquals(RoomPhase.GAME_STARTING, f.room.phase);
  }

  @Test
  void gamesWithoutIntroStartImmediately() {
    var f = started("pokeddle-race", 2);
    assertNull(f.room.intro);
    assertNull(f.room.introTimer);
    assertNull(f.view().gameIntro());
    assertTrue(f.room.phase != RoomPhase.GAME_STARTING, "fase " + f.room.phase);
    var error = assertThrows(RoomException.class, () -> f.skip(0));
    assertEquals("El minijuego ya ha cambiado.", error.getMessage());
  }

  @Test
  void introPublicStateOfTheSixGamesDoesNotThrow() {
    for (var gameId : INTRO_GAMES) {
      var f = started(gameId, 4);
      assertEquals(RoomPhase.GAME_STARTING, f.room.phase, gameId);
      assertNotNull(f.room.intro, gameId);
      // El estado sin arrancar no tiene plazos: la sala no programa ningún tick del motor.
      assertNull(f.room.transitionTimer, gameId);
      for (var person : f.people) {
        var view = assertDoesNotThrow(() -> f.kit.manager.view(f.room, person.id()), gameId);
        assertEquals(gameId, view.game().get("gameId").getStringValue());
        assertNotNull(view.gameSkipState(), gameId);
      }
      assertDoesNotThrow(() -> RoomTestKit.serialize(f.view()), gameId);
      // Al terminar la intro, cada motor arranca su primera fase.
      for (int index = 0; index < f.people.size(); index++) f.skip(index);
      assertNull(f.room.intro, gameId);
      assertTrue(f.room.phase != RoomPhase.GAME_STARTING, gameId + ": " + f.room.phase);
    }
  }

  @Test
  void introTimerIsANoOpAfterTheGameEnds() {
    var f = started("pokedex-distance", 2);
    var instanceId = f.room.game.resultId;
    // El callback de la intro ya encolado cuando la partida termina (como si el planificador lo hubiera sacado).
    var queuedIntroTimer = f.kit.time.lastScheduledTask();
    for (int index = 0; index < 2; index++) {
      f.kit.manager.setGameSkipVote(f.id(index),
          json("{\"gameInstanceId\":\"" + instanceId + "\",\"wantsToSkip\":true}"));
    }
    // Saltar el minijuego por voto relanza el mismo juego en modo fijo, ya sin intro.
    var replacement = f.room.game;
    assertNotNull(replacement);
    assertTrue(!replacement.resultId.equals(instanceId));
    assertNull(f.room.intro);
    assertNull(f.room.introTimer);
    var phase = f.room.phase;
    var state = replacement.state;
    queuedIntroTimer.run();
    assertSame(replacement, f.room.game);
    assertEquals(phase, f.room.phase);
    assertSame(state, replacement.state);
  }

  @Test
  void introTimerIsANoOpAfterTheRoomEmpties() {
    var f = started("pokedex-distance", 2);
    f.kit.manager.leave(f.id(1));
    assertEquals(RoomPhase.GAME_STARTING, f.room.phase);
    f.kit.manager.leave(f.id(0));
    assertNull(f.room.introTimer);
    assertNull(f.kit.manager.store.get(f.room.code));
    assertDoesNotThrow(() -> f.kit.time.advance(INTRO_MS));
  }

  @Test
  void hostLeavingDuringTheIntroDoesNotHangIt() {
    var f = started("pokedex-distance", 3);
    f.skip(1);
    f.kit.manager.leave(f.id(0));
    assertEquals(f.id(1), f.room.hostId);
    assertEquals(RoomPhase.GAME_STARTING, f.room.phase);
    f.skip(2);
    assertEquals(RoomPhase.ROUND_ACTIVE, f.room.phase);
  }

  @Test
  void aPlayerReconnectingDuringTheIntroDecidesAgain() {
    var f = started("pokedex-distance", 3);
    f.kit.manager.disconnect(f.id(2), "socket-" + f.id(2));
    f.skip(0);
    assertTrue(f.room.intro.presenceChanged);
    f.kit.manager.connect(f.people.get(2), "socket-again-" + f.id(2));
    f.skip(1);
    // Ha vuelto: la intro le espera otra vez.
    assertEquals(RoomPhase.GAME_STARTING, f.room.phase);
    f.skip(2);
    assertEquals(RoomPhase.ROUND_ACTIVE, f.room.phase);
  }

  @Test
  void introPresenceFlagStaysOffWithoutPresenceChanges() {
    var f = started("pokedex-distance", 2);
    f.skip(0);
    assertTrue(!f.room.intro.presenceChanged);
  }

  @Test
  void aGameLaunchedFromTheNextGameVoteShowsItsIntroOnlyTheFirstTime() {
    var f = lobby("higher-lower", 2);
    f.kit.manager.updateConfig(f.id(0), json(RoomTestKit.HIGHER_LOWER_1_ROUND));
    f.kit.manager.updateGameSelection(f.id(0),
        json("{\"type\":\"VOTE\",\"gameIds\":[\"higher-lower\",\"pokedex-distance\",\"type-duel\"]}"));
    f.kit.startReady(f.room, f.id(0));
    assertNotNull(f.room.intro);
    f.skip(0);
    f.skip(1);
    f.kit.passDeadline(f.room);
    f.kit.passDeadline(f.room);
    assertEquals(RoomPhase.GAME_RESULTS, f.room.phase);

    // La votación elige Pokédex Distance, que no se ha jugado: intro.
    f.kit.manager.continueSession(f.id(0));
    voteAndLaunch(f, "pokedex-distance");
    assertEquals("pokedex-distance", f.room.game.gameId);
    assertEquals(RoomPhase.GAME_STARTING, f.room.phase);
    assertNotNull(f.view().gameIntro());

    // Se salta el minijuego por voto y la votación vuelve a Higher or Lower, ya presentado: arranca directo.
    var instanceId = f.room.game.resultId;
    for (int index = 0; index < 2; index++) {
      f.kit.manager.setGameSkipVote(f.id(index),
          json("{\"gameInstanceId\":\"" + instanceId + "\",\"wantsToSkip\":true}"));
    }
    voteAndLaunch(f, "higher-lower");
    assertEquals("higher-lower", f.room.game.gameId);
    assertNull(f.room.intro);
    assertEquals(RoomPhase.ROUND_ACTIVE, f.room.phase);
  }

  private static void voteAndLaunch(Fixture f, String gameId) {
    assertEquals(RoomPhase.NEXT_GAME_VOTE, f.room.phase);
    assertTrue(f.room.nextGameVote.optionGameIds.contains(gameId), f.room.nextGameVote.optionGameIds.toString());
    for (int index = 0; index < 2; index++) f.kit.manager.voteNextGame(f.id(index), gameId);
    assertEquals(RoomPhase.NEXT_GAME_VOTE_RESULTS, f.room.phase);
    f.kit.time.advance(RoomCoordinator.NEXT_GAME_VOTE_RESULT_MS + RoomCoordinator.DEADLINE_TOLERANCE_MS);
  }
}
