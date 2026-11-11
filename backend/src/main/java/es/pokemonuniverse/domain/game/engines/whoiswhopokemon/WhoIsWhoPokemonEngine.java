package es.pokemonuniverse.domain.game.engines.whoiswhopokemon;

import es.pokemonuniverse.domain.game.GameManifest;
import es.pokemonuniverse.domain.game.engine.CursorChannel;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameActionResult;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GameEngine;
import es.pokemonuniverse.domain.game.engine.GameLifecycle;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.infra.Randoms;
import es.pokemonuniverse.domain.game.engine.infra.TimedLifecycle;
import es.pokemonuniverse.domain.game.engine.infra.Timing;
import es.pokemonuniverse.domain.game.engines.whoiswhopokemon.WhoIsWhoPokemonConfig.WhoIsWhoSecretSelection;
import es.pokemonuniverse.domain.game.engines.whoiswhopokemon.WhoIsWhoPokemonTypes.WhoIsWhoGuess;
import es.pokemonuniverse.domain.game.engines.whoiswhopokemon.WhoIsWhoPokemonTypes.WhoIsWhoPlayerState;
import es.pokemonuniverse.domain.game.engines.whoiswhopokemon.WhoIsWhoPokemonTypes.WhoIsWhoPokemonAction;
import es.pokemonuniverse.domain.game.engines.whoiswhopokemon.WhoIsWhoPokemonTypes.WhoIsWhoPokemonAction.EndTurn;
import es.pokemonuniverse.domain.game.engines.whoiswhopokemon.WhoIsWhoPokemonTypes.WhoIsWhoPokemonAction.GuessPokemon;
import es.pokemonuniverse.domain.game.engines.whoiswhopokemon.WhoIsWhoPokemonTypes.WhoIsWhoPokemonAction.SelectSecret;
import es.pokemonuniverse.domain.game.engines.whoiswhopokemon.WhoIsWhoPokemonTypes.WhoIsWhoPokemonAction.ToggleDiscard;
import es.pokemonuniverse.domain.game.engines.whoiswhopokemon.WhoIsWhoPokemonTypes.WhoIsWhoPokemonCard;
import es.pokemonuniverse.domain.game.engines.whoiswhopokemon.WhoIsWhoPokemonTypes.WhoIsWhoPublicState;
import es.pokemonuniverse.domain.game.engines.whoiswhopokemon.WhoIsWhoPokemonTypes.WhoIsWhoPublicTeam;
import es.pokemonuniverse.domain.game.engines.whoiswhopokemon.WhoIsWhoPokemonTypes.WhoIsWhoPublicTeams;
import es.pokemonuniverse.domain.game.engines.whoiswhopokemon.WhoIsWhoPokemonTypes.WhoIsWhoRevealedSecrets;
import es.pokemonuniverse.domain.game.engines.whoiswhopokemon.WhoIsWhoPokemonTypes.WhoIsWhoRole;
import es.pokemonuniverse.domain.game.engines.whoiswhopokemon.WhoIsWhoPokemonTypes.WhoIsWhoState;
import es.pokemonuniverse.domain.game.engines.whoiswhopokemon.WhoIsWhoPokemonTypes.WhoIsWhoStats;
import es.pokemonuniverse.domain.game.engines.whoiswhopokemon.WhoIsWhoPokemonTypes.WhoIsWhoTeam;
import es.pokemonuniverse.domain.game.engines.whoiswhopokemon.WhoIsWhoPokemonTypes.WhoIsWhoTeamState;
import es.pokemonuniverse.domain.game.engines.whoiswhopokemon.WhoIsWhoPokemonTypes.WhoIsWhoTeams;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

/**
 * Traducción literal de {@code who-is-who-pokemon/server.ts}. Dos equipos por turnos ({@code currentTeam},
 * {@code turnNumber}); la fase activa es siempre {@code TURN_ACTIVE} y {@code roundEndsAt} es el plazo de selección o
 * el del turno. Comparte cursores en vivo con el propio equipo ({@link #getCursorChannel}).
 */
public final class WhoIsWhoPokemonEngine
    implements GameEngine<WhoIsWhoPokemonConfig, WhoIsWhoState, WhoIsWhoPokemonAction, WhoIsWhoPublicState> {

  public static final String ID = "who-is-who-pokemon";
  private static final List<WhoIsWhoTeam> TEAMS = List.of(WhoIsWhoTeam.BLUE, WhoIsWhoTeam.RED);
  private static final String NOT_ON_BOARD = "Ese Pokémon no está en el tablero.";

  private final GameManifest manifest;

  /** {@code manifest} es el de {@code games/registry.json} para {@value #ID}. */
  public WhoIsWhoPokemonEngine(GameManifest manifest) {
    if (!ID.equals(Objects.requireNonNull(manifest, "manifest").id())) {
      throw new IllegalArgumentException("Manifiesto de " + manifest.id() + " para el motor " + ID);
    }
    this.manifest = manifest;
  }

  @Override
  public GameManifest manifest() {
    return manifest;
  }

  @Override
  public WhoIsWhoPokemonConfig parseConfig(JsonNode raw) {
    return WhoIsWhoPokemonConfig.parse(raw);
  }

  @Override
  public WhoIsWhoPokemonAction parseAction(JsonNode raw) {
    return WhoIsWhoPokemonAction.parse(raw);
  }

  @Override
  public WhoIsWhoPokemonConfig defaultConfig() {
    return WhoIsWhoPokemonConfig.defaults();
  }

  private static WhoIsWhoPokemonCard card(Pokemon pokemon) {
    return new WhoIsWhoPokemonCard(pokemon.id(), pokemon.nationalDexNumber(), pokemon.name(), pokemon.sprite());
  }

  @Nullable
  private static WhoIsWhoTeam teamFor(WhoIsWhoState state, String playerId) {
    for (var team : TEAMS) {
      if (state.teams().get(team).playerIds().contains(playerId)) return team;
    }
    return null;
  }

  @Nullable
  private static WhoIsWhoPokemonCard boardCard(WhoIsWhoState state, @Nullable String pokemonId) {
    for (var entry : state.board()) {
      if (entry.id().equals(pokemonId)) return entry;
    }
    return null;
  }

  private static long turnEndsAt(WhoIsWhoState state, GameContext context) {
    return context.now() + state.config().turnSeconds() * 1_000L;
  }

  private static WhoIsWhoState finish(WhoIsWhoState state, @Nullable WhoIsWhoTeam winnerTeam) {
    var scores = new LinkedHashMap<>(state.scores());
    var playerStats = new LinkedHashMap<>(state.playerStats());
    if (winnerTeam != null) {
      for (var id : state.teams().get(winnerTeam).playerIds()) scores.put(id, scores.getOrDefault(id, 0) + WhoIsWhoPokemonRules.WIN_POINTS);
      for (var id : state.teams().get(winnerTeam).playerIds()) {
        playerStats.put(id, Objects.requireNonNull(playerStats.get(id), "playerStats").withWin());
      }
    }
    return state.toBuilder()
        .phase(GamePhase.GAME_RESULTS)
        .roundEndsAt(null)
        .winnerTeam(winnerTeam)
        .scores(scores)
        .playerStats(playerStats)
        .build();
  }

  private static WhoIsWhoState beginNextRound(WhoIsWhoState state, GameContext context) {
    return state.toBuilder()
        .currentTeam(WhoIsWhoTeam.BLUE)
        .roundNumber(state.roundNumber() + 1)
        .turnNumber(state.turnNumber() + 1)
        .roundStartedAt(context.now())
        .roundEndsAt(turnEndsAt(state, context))
        .build();
  }

  private static WhoIsWhoState advanceTurn(WhoIsWhoState state, GameContext context) {
    if (state.currentTeam() == WhoIsWhoTeam.RED) {
      if (state.roundNumber() >= state.config().rounds()) return finish(state, null);
      return beginNextRound(state, context);
    }
    return state.toBuilder()
        .currentTeam(WhoIsWhoTeam.RED)
        .turnNumber(state.turnNumber() + 1)
        .roundStartedAt(context.now())
        .roundEndsAt(turnEndsAt(state, context))
        .build();
  }

  /** Solo en {@code TURN_ACTIVE} y con los compañeros del propio equipo, sobre los Pokémon del tablero. */
  @Override
  public Optional<CursorChannel> getCursorChannel(WhoIsWhoState state, String playerId) {
    var team = teamFor(state, playerId);
    if (state.phase() != GamePhase.TURN_ACTIVE || team == null) return Optional.empty();
    return Optional.of(new CursorChannel(state.teams().get(team).playerIds(),
        state.board().stream().map(WhoIsWhoPokemonCard::id).toList()));
  }

  /**
   * Consume {@code random} {@code boardSize} veces (tablero), una por jugador (equipos) y dos más si los secretos son
   * aleatorios. La configuración ya llega normalizada por {@link #parseConfig}.
   */
  @Override
  public WhoIsWhoState createInitialState(WhoIsWhoPokemonConfig config, GameContext context) {
    var pool = context.pokemon().forGenerations(config.generations(), config.includeForms());
    if (context.players().size() < 2) throw new EngineException("Se necesitan al menos 2 jugadores.");
    if (pool.size() < config.boardSize()) {
      throw new EngineException("No hay suficientes Pokémon para un tablero de " + config.boardSize() + ".");
    }
    var selected = Randoms.takeRandom(pool, config.boardSize(), context.random());
    var shuffledPlayers = Randoms.takeRandom(context.players(), context.players().size(), context.random());
    var blue = new ArrayList<String>();
    var red = new ArrayList<String>();
    for (int index = 0; index < shuffledPlayers.size(); index++) {
      (index % 2 == 0 ? blue : red).add(shuffledPlayers.get(index).id());
    }
    var secrets = config.secretSelection() == WhoIsWhoSecretSelection.RANDOM
        ? Randoms.takeRandom(selected, 2, context.random()) : List.<Pokemon>of();
    var scores = new LinkedHashMap<String, Integer>();
    var playerStats = new LinkedHashMap<String, WhoIsWhoStats>();
    for (var player : context.players()) scores.put(player.id(), 0);
    for (var player : context.players()) playerStats.put(player.id(), WhoIsWhoStats.ZERO);
    return WhoIsWhoState.builder()
        .phase(GamePhase.GAME_STARTING)
        .config(config)
        .playerIds(context.players().stream().map(GamePlayer::id).toList())
        .board(selected.stream().map(WhoIsWhoPokemonEngine::card).toList())
        .teams(new WhoIsWhoTeams(
            new WhoIsWhoTeamState(blue, secrets.size() > 0 ? secrets.get(0).id() : null, List.of()),
            new WhoIsWhoTeamState(red, secrets.size() > 1 ? secrets.get(1).id() : null, List.of())))
        .currentTeam(WhoIsWhoTeam.BLUE)
        .roundNumber(1)
        .turnNumber(1)
        .roundStartedAt(null)
        .roundEndsAt(null)
        .scores(scores)
        .playerStats(playerStats)
        .guesses(List.of())
        .winnerTeam(null)
        .build();
  }

  @Override
  public WhoIsWhoState start(WhoIsWhoState state, GameContext context) {
    boolean ready = state.teams().allSecretsReady();
    Long roundEndsAt = ready ? Long.valueOf(turnEndsAt(state, context))
        : state.config().selectionSeconds() > 0 ? Long.valueOf(context.now() + state.config().selectionSeconds() * 1_000L)
        : null;
    return state.toBuilder()
        .phase(GamePhase.TURN_ACTIVE)
        .roundStartedAt(ready ? context.now() : null)
        .roundEndsAt(roundEndsAt)
        .build();
  }

  @Override
  public GameActionResult<WhoIsWhoState> handleAction(WhoIsWhoState state, String playerId,
      WhoIsWhoPokemonAction action, GameContext context) {
    var team = teamFor(state, playerId);
    if (team == null || !context.isPlayerRequired(playerId)) {
      return GameActionResult.reject(state, "No puedes actuar en esta partida.");
    }
    if (state.phase() != GamePhase.TURN_ACTIVE) {
      return GameActionResult.reject(state, "La partida no está en un turno activo.");
    }
    if (action instanceof SelectSecret select) {
      if (Timing.deadlineReached(context.now(), state.roundEndsAt())) {
        return GameActionResult.reject(state, "El tiempo de selección ha terminado.");
      }
      if (state.config().secretSelection() != WhoIsWhoSecretSelection.PLAYER_CHOICE) {
        return GameActionResult.reject(state, "Los Pokémon secretos se asignan aleatoriamente.");
      }
      // {@code if (state.teams[team].secretPokemonId)}: los ids del tablero nunca son la cadena vacía.
      if (state.teams().get(team).secretPokemonId() != null) {
        return GameActionResult.reject(state, "Tu equipo ya ha elegido su Pokémon secreto.");
      }
      if (boardCard(state, select.pokemonId()) == null) return GameActionResult.reject(state, NOT_ON_BOARD);
      var next = state.toBuilder()
          .teams(state.teams().with(team, state.teams().get(team).withSecret(select.pokemonId())))
          .build();
      return GameActionResult.accept(next.teams().allSecretsReady()
          ? next.toBuilder().roundStartedAt(context.now()).roundEndsAt(turnEndsAt(state, context)).build()
          : next);
    }
    if (!state.teams().allSecretsReady()) {
      return GameActionResult.reject(state, "Esperando a que ambos equipos elijan su Pokémon secreto.");
    }
    if (action instanceof ToggleDiscard toggle) {
      if (boardCard(state, toggle.pokemonId()) == null) return GameActionResult.reject(state, NOT_ON_BOARD);
      var current = new LinkedHashSet<>(state.teams().get(team).discardedPokemonIds());
      if (!current.remove(toggle.pokemonId())) current.add(toggle.pokemonId());
      return GameActionResult.accept(state.toBuilder()
          .teams(state.teams().with(team, state.teams().get(team).withDiscarded(new ArrayList<>(current))))
          .build());
    }
    if (team != state.currentTeam()) return GameActionResult.reject(state, "Es el turno del otro equipo.");
    if (Timing.deadlinePassedOrMissing(context.now(), state.roundEndsAt())) {
      // Rechazada, pero el turno caducado avanza igualmente.
      return GameActionResult.reject(advanceTurn(state, context), "El tiempo ha terminado.");
    }
    if (action instanceof EndTurn) return GameActionResult.accept(advanceTurn(state, context));
    var guessAction = (GuessPokemon) action;
    boolean alreadyGuessed = state.guesses().stream()
        .anyMatch(guess -> guess.team() == team && guess.turnNumber() == state.turnNumber());
    if (alreadyGuessed) return GameActionResult.reject(state, "Este equipo ya ha intentado adivinar en este turno.");
    var pokemon = boardCard(state, guessAction.pokemonId());
    if (pokemon == null) return GameActionResult.reject(state, NOT_ON_BOARD);
    boolean correct = pokemon.id().equals(state.teams().get(team.rival()).secretPokemonId());
    var guess = new WhoIsWhoGuess(team, playerId, pokemon.id(), correct, context.now(), state.turnNumber());
    var guesses = new ArrayList<>(state.guesses());
    guesses.add(guess);
    var playerStats = new LinkedHashMap<>(state.playerStats());
    playerStats.put(playerId, Objects.requireNonNull(state.playerStats().get(playerId), "playerStats").afterGuess(correct));
    var next = state.toBuilder().guesses(guesses).playerStats(playerStats).build();
    return GameActionResult.accept(correct ? finish(next, team) : advanceTurn(next, context));
  }

  /** Consume {@code random} una vez por equipo sin secreto al vencer el plazo de selección. */
  @Override
  public WhoIsWhoState handleTimeout(WhoIsWhoState state, GameContext context) {
    if (state.phase() != GamePhase.TURN_ACTIVE || !Timing.deadlineReached(context.now(), state.roundEndsAt())) {
      return state;
    }
    if (!state.teams().allSecretsReady()) {
      var nextTeams = state.teams();
      for (var team : TEAMS) {
        if (nextTeams.get(team).secretPokemonId() != null) continue;
        var secret = Randoms.takeRandom(state.board(), 1, context.random()).getFirst();
        nextTeams = nextTeams.with(team, nextTeams.get(team).withSecret(secret.id()));
      }
      return state.toBuilder()
          .teams(nextTeams)
          .roundStartedAt(context.now())
          .roundEndsAt(turnEndsAt(state, context))
          .build();
    }
    return advanceTurn(state, context);
  }

  /** Un equipo sin ningún miembro activo ({@code active !== false}; la conexión no cuenta) pierde la partida. */
  @Override
  public WhoIsWhoState handlePresenceChange(WhoIsWhoState state, GameContext context) {
    if (state.phase() == GamePhase.GAME_RESULTS) return state;
    for (var team : TEAMS) {
      boolean nobodyActive = state.teams().get(team).playerIds().stream()
          .noneMatch(id -> context.players().stream()
              .anyMatch(player -> player.id().equals(id) && !Boolean.FALSE.equals(player.active())));
      if (nobodyActive) return finish(state, team.rival());
    }
    return state;
  }

  @Override
  public WhoIsWhoPublicState getPublicState(WhoIsWhoState state, GameContext context) {
    boolean reveal = state.phase() == GamePhase.GAME_RESULTS;
    var blue = state.teams().blue();
    var red = state.teams().red();
    return new WhoIsWhoPublicState(ID, state.phase(), state.board(),
        new WhoIsWhoPublicTeams(new WhoIsWhoPublicTeam(blue.playerIds(), blue.secretPokemonId() != null),
            new WhoIsWhoPublicTeam(red.playerIds(), red.secretPokemonId() != null)),
        state.currentTeam(), state.roundNumber(), state.turnNumber(), state.config().rounds(), state.roundStartedAt(),
        state.roundEndsAt(), state.guesses(), state.winnerTeam(),
        new WhoIsWhoRevealedSecrets(reveal ? boardCard(state, blue.secretPokemonId()) : null,
            reveal ? boardCard(state, red.secretPokemonId()) : null),
        reveal ? WhoIsWhoPokemonRules.buildWhoIsWhoResults(state) : null);
  }

  @Override
  public WhoIsWhoPlayerState getPlayerState(WhoIsWhoState state, String playerId, GameContext context) {
    var team = teamFor(state, playerId);
    var ownSecret = team != null ? boardCard(state, state.teams().get(team).secretPokemonId()) : null;
    WhoIsWhoGuess lastGuess = null;
    for (var guess : state.guesses().reversed()) {
      if (guess.playerId().equals(playerId)) {
        lastGuess = guess;
        break;
      }
    }
    boolean guessUsed = team != null && state.guesses().stream()
        .anyMatch(guess -> guess.team() == team && guess.turnNumber() == state.turnNumber());
    boolean required = team != null && context.isPlayerRequired(playerId);
    boolean allSecretsReady = state.teams().allSecretsReady();
    boolean canAct = required && allSecretsReady && state.phase() == GamePhase.TURN_ACTIVE
        && state.currentTeam() == team;
    return WhoIsWhoPlayerState.builder()
        .role(team != null ? WhoIsWhoRole.PLAYER : WhoIsWhoRole.SPECTATOR)
        .team(team)
        .ownSecret(ownSecret)
        .discardedPokemonIds(team != null ? state.teams().get(team).discardedPokemonIds() : List.of())
        .canChooseSecret(required && state.config().secretSelection() == WhoIsWhoSecretSelection.PLAYER_CHOICE
            && ownSecret == null)
        .canManageBoard(required && allSecretsReady && state.phase() == GamePhase.TURN_ACTIVE)
        .canAct(canAct)
        .canGuess(canAct && !guessUsed)
        .guessUsed(guessUsed)
        .lastGuess(lastGuess)
        .build();
  }

  /** {@code timedGameLifecycle} lee {@code roundNumber}, {@code turnNumber} y {@code currentTeam} para la época. */
  @Override
  public GameLifecycle getLifecycle(WhoIsWhoState state) {
    return TimedLifecycle.builder(state.phase())
        .roundEndsAt(state.roundEndsAt())
        .roundStartedAt(state.roundStartedAt())
        .roundNumber(state.roundNumber())
        .turnNumber(state.turnNumber())
        .currentTeam(state.currentTeam().name())
        .build();
  }

  @Override
  public boolean isFinished(WhoIsWhoState state) {
    return state.phase() == GamePhase.GAME_RESULTS;
  }

  @Override
  public GameResults getResults(WhoIsWhoState state) {
    return WhoIsWhoPokemonRules.buildWhoIsWhoResults(state);
  }
}
