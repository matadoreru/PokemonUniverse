package es.pokemonuniverse.domain.game.engines.absurdpokedex;

import es.pokemonuniverse.domain.game.GameManifest;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameActionResult;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GameEngine;
import es.pokemonuniverse.domain.game.engine.GameLifecycle;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.infra.JsStrings;
import es.pokemonuniverse.domain.game.engine.infra.Randoms;
import es.pokemonuniverse.domain.game.engine.infra.TimedLifecycle;
import es.pokemonuniverse.domain.game.engines.absurdpokedex.AbsurdPokedexTypes.AbsurdPokedexAction;
import es.pokemonuniverse.domain.game.engines.absurdpokedex.AbsurdPokedexTypes.AbsurdPokedexEntry;
import es.pokemonuniverse.domain.game.engines.absurdpokedex.AbsurdPokedexTypes.AbsurdPokedexEntryView;
import es.pokemonuniverse.domain.game.engines.absurdpokedex.AbsurdPokedexTypes.AbsurdPokedexOwnEntry;
import es.pokemonuniverse.domain.game.engines.absurdpokedex.AbsurdPokedexTypes.AbsurdPokedexPlayerState;
import es.pokemonuniverse.domain.game.engines.absurdpokedex.AbsurdPokedexTypes.AbsurdPokedexPlayerStats;
import es.pokemonuniverse.domain.game.engines.absurdpokedex.AbsurdPokedexTypes.AbsurdPokedexPublicState;
import es.pokemonuniverse.domain.game.engines.absurdpokedex.AbsurdPokedexTypes.AbsurdPokedexRealEntry;
import es.pokemonuniverse.domain.game.engines.absurdpokedex.AbsurdPokedexTypes.AbsurdPokedexRoundResult;
import es.pokemonuniverse.domain.game.engines.absurdpokedex.AbsurdPokedexTypes.AbsurdPokedexState;
import es.pokemonuniverse.domain.pokemon.PokedexEntryPokemonCatalog;
import es.pokemonuniverse.domain.pokemon.PokedexEntryText;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

/**
 * Pokédex Absurda: cada ronda sale un Pokémon real, los jugadores escriben en secreto una entrada de Pokédex
 * ({@code ROUND_ACTIVE}) y luego votan las entradas anónimas ({@code VOTING}). En {@code REAL_ENTRY} se mezcla la
 * oficial con las inventadas. Sigue a La Frase ({@code pokemonredflag/}) sin su segunda vuelta de desempate.
 *
 * <p>Privacidad: hasta {@code ROUND_RESULTS} ninguna proyección expone autores, cuál es la oficial ni votos ajenos;
 * solo los ids de quién ha enviado o votado. El borrador y la entrada propia solo salen en la proyección de su
 * jugador.
 */
public final class AbsurdPokedexEngine
    implements GameEngine<AbsurdPokedexConfig, AbsurdPokedexState, AbsurdPokedexAction, AbsurdPokedexPublicState> {

  public static final String ID = "absurd-pokedex";

  private static final String NO_ENTRIES = "No hay Pokémon con entradas de Pokédex en las generaciones seleccionadas.";

  private final GameManifest manifest;

  /** {@code manifest} es el de {@code games/registry.json} para {@value #ID}. */
  public AbsurdPokedexEngine(GameManifest manifest) {
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
  public AbsurdPokedexConfig parseConfig(JsonNode raw) {
    return AbsurdPokedexConfig.parse(raw);
  }

  @Override
  public AbsurdPokedexAction parseAction(JsonNode raw) {
    return AbsurdPokedexAction.parse(raw);
  }

  @Override
  public AbsurdPokedexConfig defaultConfig() {
    return AbsurdPokedexConfig.defaults();
  }

  /** Sin construir el mazo: la sala lo pregunta dentro de su sección crítica en cada elección de juego. */
  @Override
  public Optional<String> checkAvailability(AbsurdPokedexConfig config, GameContext context) {
    if (!(context.pokemon() instanceof PokedexEntryPokemonCatalog catalog)) return Optional.of(NO_ENTRIES);
    return AbsurdPokedexRules.availabilityIssue(config, catalog);
  }

  /** Consume {@code random} al barajar el mazo ({@code size - 1} extracciones). */
  @Override
  public AbsurdPokedexState createInitialState(AbsurdPokedexConfig config, GameContext context) {
    if (context.players().size() < manifest.minPlayers()) {
      throw new EngineException("Se necesitan al menos " + manifest.minPlayers() + " jugadores.");
    }
    // Salas sin BD: el catálogo no trae entradas de Pokédex.
    if (!(context.pokemon() instanceof PokedexEntryPokemonCatalog catalog)) throw new EngineException(NO_ENTRIES);
    // El mazo se calcula una sola vez y sirve para comprobar la disponibilidad y para barajar.
    var pool = AbsurdPokedexRules.pool(config, catalog);
    var issue = AbsurdPokedexRules.availabilityIssue(config, pool);
    if (issue.isPresent()) throw new EngineException(issue.get());
    var deck = Randoms.contentDeck(pool, config.rounds(), context.random(), Pokemon::id);
    var playerIds = context.players().stream().map(GamePlayer::id).toList();
    var scores = new LinkedHashMap<String, Integer>();
    var playerStats = new LinkedHashMap<String, AbsurdPokedexPlayerStats>();
    for (var id : playerIds) {
      scores.put(id, 0);
      playerStats.put(id, AbsurdPokedexPlayerStats.ZERO);
    }
    return AbsurdPokedexState.builder()
        .phase(GamePhase.GAME_STARTING)
        .config(config)
        .playerIds(playerIds)
        .pokemonDeckIds(deck.stream().map(Pokemon::id).toList())
        .roundNumber(0)
        .scores(scores)
        .playerStats(playerStats)
        .build();
  }

  @Override
  public AbsurdPokedexState start(AbsurdPokedexState state, GameContext context) {
    if (state.phase() != GamePhase.GAME_STARTING) throw new EngineException("La partida ya ha comenzado.");
    return beginRound(state, context);
  }

  private static Pokemon pokemonOf(AbsurdPokedexState state, GameContext context) {
    var id = Objects.requireNonNull(state.currentPokemon(), "currentPokemon").id();
    return context.pokemon().byId(id).orElseThrow(() -> new EngineException("Pokémon desconocido: " + id));
  }

  /** La ronda siguiente, o {@code GAME_RESULTS} tras la última. Limpia todo lo de la ronda anterior. */
  private static AbsurdPokedexState beginRound(AbsurdPokedexState state, GameContext context) {
    if (state.roundNumber() >= state.config().rounds()) {
      return state.toBuilder().phase(GamePhase.GAME_RESULTS).roundEndsAt(null).nextTransitionAt(null).build();
    }
    int roundNumber = state.roundNumber() + 1;
    var pokemonId = state.pokemonDeckIds().get((roundNumber - 1) % state.pokemonDeckIds().size());
    var pokemon = context.pokemon().byId(pokemonId)
        .orElseThrow(() -> new EngineException("Pokémon desconocido: " + pokemonId));
    if (context.preloadImage() != null) context.preloadImage().accept(pokemon.sprite());
    return state.toBuilder()
        .phase(GamePhase.ROUND_ACTIVE)
        .roundNumber(roundNumber)
        .currentPokemon(AbsurdPokedexRules.pokemonView(pokemon))
        .realEntry(null)
        .drafts(Map.of())
        .submissions(Map.of())
        .entries(List.of())
        .votes(Map.of())
        .funnyVotes(Map.of())
        .funnyPicks(Map.of())
        .roundEndsAt(context.now() + state.config().writeSeconds() * 1_000L)
        .nextTransitionAt(null)
        .lastRound(null)
        .build();
  }

  private static boolean deadlinePassed(AbsurdPokedexState state, GameContext context) {
    return state.roundEndsAt() == null || context.now() >= state.roundEndsAt();
  }

  /** Votan todos los jugadores conectados de la partida, hayan enviado entrada o no (como La Frase). */
  private static boolean allEligibleVoted(AbsurdPokedexState state, GameContext context) {
    return context.allConnectedRequiredCompleted(state.playerIds(), state.votes()::containsKey);
  }

  /**
   * Cierra la escritura. Como en La Frase, el borrador pendiente de quien no envió pasa a entrada recortado con el
   * {@code trim} de JS. Si hay pocas entradas (menos de 2 en Clásico, ninguna inventada en {@code REAL_ENTRY}) la
   * ronda se salta sin consumir {@code random}. Si no, en {@code REAL_ENTRY} se elige la oficial
   * ({@code randomItem}) y se tapa el nombre también en las inventadas; después se baraja la lista (la oficial
   * primero y las inventadas en el orden de {@code playerIds}) y se numeran {@code entry-1…n} en el orden barajado.
   */
  private static AbsurdPokedexState beginVoting(AbsurdPokedexState state, GameContext context) {
    var submissions = new LinkedHashMap<String, String>();
    for (var playerId : state.playerIds()) {
      var submitted = state.submissions().get(playerId);
      var draft = state.drafts().get(playerId);
      var text = submitted != null ? submitted : draft == null ? "" : JsStrings.trim(draft);
      if (!text.isEmpty() && text.length() <= AbsurdPokedexRules.MAX_ENTRY_LENGTH) submissions.put(playerId, text);
    }
    var mode = state.config().mode();
    var pokemon = pokemonOf(state, context);
    var missing = state.playerIds().stream().filter(playerId -> !submissions.containsKey(playerId)).toList();
    boolean real = mode == AbsurdPokedexMode.REAL_ENTRY;
    var next = state.toBuilder().submissions(submissions);
    if (submissions.size() < (real ? 1 : 2)) {
      return finish(next.build(), AbsurdPokedexRules.skippedRound(mode, pokemon, missing), context);
    }
    record Draft(String text, @Nullable String authorId) {}
    var pending = new ArrayList<Draft>();
    AbsurdPokedexRealEntry realEntry = null;
    if (real) {
      var catalog = (PokedexEntryPokemonCatalog) context.pokemon();
      var chosen = Randoms.randomItem(AbsurdPokedexRules.usableRealEntries(pokemon, catalog), context.random());
      realEntry = new AbsurdPokedexRealEntry(chosen.text(), chosen.versionLabel());
      pending.add(new Draft(chosen.text(), null));
    }
    for (var submission : submissions.entrySet()) {
      // El tapado solo cambia lo que se muestra: con un nombre o alias de menos de 3 letras, «???» puede pasar de 150.
      var text = real ? PokedexEntryText.sanitize(submission.getValue(), pokemon) : submission.getValue();
      pending.add(new Draft(text, submission.getKey()));
    }
    var shuffled = Randoms.shuffled(pending, context.random());
    var entries = new ArrayList<AbsurdPokedexEntry>();
    for (int index = 0; index < shuffled.size(); index++) {
      var draft = shuffled.get(index);
      entries.add(new AbsurdPokedexEntry("entry-" + (index + 1), draft.text(), draft.authorId(),
          draft.authorId() == null));
    }
    return next
        .phase(GamePhase.VOTING)
        .realEntry(realEntry)
        .entries(entries)
        .votes(Map.of())
        .funnyVotes(Map.of())
        .funnyPicks(Map.of())
        .roundEndsAt(context.now() + state.config().voteSeconds() * 1_000L)
        .build();
  }

  /** Puntúa la votación: los votos ya llegan validados por {@link #handleAction}. */
  private static AbsurdPokedexState resolveVote(AbsurdPokedexState state, GameContext context) {
    var missing = state.playerIds().stream().filter(playerId -> !state.submissions().containsKey(playerId)).toList();
    var versionLabel = state.realEntry() == null ? null : state.realEntry().versionLabel();
    var round = AbsurdPokedexRules.score(state.config().mode(), pokemonOf(state, context), state.entries(),
        state.votes(), state.funnyVotes(), versionLabel, missing);
    return finish(state, round, context);
  }

  /**
   * Pasa a {@code ROUND_RESULTS} con {@code round}: suma los puntos (todo jugador conserva su entrada en
   * {@code scores}, también con 0) y las estadísticas. {@code roundsPlayed} cuenta también las rondas saltadas;
   * {@code votesReceived} son los votos de «es la real» o «la más absurda» a la entrada propia, y en
   * {@code REAL_ENTRY} esos mismos votos son {@code playersFooled}.
   */
  private static AbsurdPokedexState finish(AbsurdPokedexState state, AbsurdPokedexRoundResult round,
      GameContext context) {
    boolean real = state.config().mode() == AbsurdPokedexMode.REAL_ENTRY;
    var officialId = state.entries().stream().filter(AbsurdPokedexEntry::isReal).map(AbsurdPokedexEntry::id)
        .findFirst().orElse(null);
    var scores = new LinkedHashMap<String, Integer>();
    var playerStats = new LinkedHashMap<String, AbsurdPokedexPlayerStats>();
    for (var playerId : state.playerIds()) {
      int points = round.pointsAwarded().getOrDefault(playerId, 0);
      scores.put(playerId, state.scores().getOrDefault(playerId, 0) + points);
      var own = round.entries().stream().filter(entry -> playerId.equals(entry.authorId())).findFirst();
      int votes = own.map(entry -> entry.votesReceived()).orElse(0);
      int funny = own.map(entry -> entry.funnyVotesReceived()).orElse(0);
      boolean guessed = real && officialId != null && officialId.equals(state.votes().get(playerId));
      var current = state.playerStats().getOrDefault(playerId, AbsurdPokedexPlayerStats.ZERO);
      playerStats.put(playerId, current.toBuilder()
          .roundsPlayed(current.roundsPlayed() + 1)
          .entriesSubmitted(current.entriesSubmitted() + (state.submissions().containsKey(playerId) ? 1 : 0))
          .votesReceived(current.votesReceived() + votes)
          .funnyVotesReceived(current.funnyVotesReceived() + funny)
          .roundWins(current.roundWins() + (round.winnerPlayerIds().contains(playerId) ? 1 : 0))
          .realGuessed(current.realGuessed() + (guessed ? 1 : 0))
          .playersFooled(current.playersFooled() + (real ? votes : 0))
          .pointsFromRounds(current.pointsFromRounds() + points)
          .build());
    }
    return state.toBuilder()
        .phase(GamePhase.ROUND_RESULTS)
        .scores(scores)
        .playerStats(playerStats)
        .roundEndsAt(null)
        .nextTransitionAt(context.now() + AbsurdPokedexRules.REVEAL_MS)
        .lastRound(round)
        .build();
  }

  private static @Nullable AbsurdPokedexEntry entryById(AbsurdPokedexState state, String entryId) {
    return state.entries().stream().filter(entry -> entry.id().equals(entryId)).findFirst().orElse(null);
  }

  /**
   * Un borrador o un envío tardío (el cliente vacía un borrador pendiente al desmontar) nunca pisa la entrada
   * enviada: después de enviar se rechaza con {@code Ya has enviado tu entrada.} y, fuera de la escritura o pasado su
   * plazo, con {@code La escritura ya ha terminado.}; en los dos casos el estado no cambia.
   */
  @Override
  public GameActionResult<AbsurdPokedexState> handleAction(AbsurdPokedexState state, String playerId,
      AbsurdPokedexAction action, GameContext context) {
    if (!state.playerIds().contains(playerId) || !context.isPlayerRequired(playerId)) {
      return GameActionResult.reject(state, "No puedes participar en esta ronda.");
    }
    if (action instanceof AbsurdPokedexAction.UpdateDraft update) {
      if (state.phase() != GamePhase.ROUND_ACTIVE || deadlinePassed(state, context)) {
        return GameActionResult.reject(state, "La escritura ya ha terminado.");
      }
      if (state.submissions().containsKey(playerId)) return GameActionResult.reject(state, "Ya has enviado tu entrada.");
      var drafts = new LinkedHashMap<>(state.drafts());
      drafts.put(playerId, update.text());
      return GameActionResult.accept(state.toBuilder().drafts(drafts).build());
    }
    if (action instanceof AbsurdPokedexAction.SubmitEntry submit) {
      if (state.phase() != GamePhase.ROUND_ACTIVE || deadlinePassed(state, context)) {
        return GameActionResult.reject(state, "La escritura ya ha terminado.");
      }
      if (state.submissions().containsKey(playerId)) return GameActionResult.reject(state, "Ya has enviado tu entrada.");
      var drafts = new LinkedHashMap<>(state.drafts());
      drafts.put(playerId, submit.text());
      var submissions = new LinkedHashMap<>(state.submissions());
      submissions.put(playerId, submit.text());
      var next = state.toBuilder().drafts(drafts).submissions(submissions).build();
      return GameActionResult.accept(
          context.allConnectedRequiredCompleted(next.playerIds(), next.submissions()::containsKey)
              ? beginVoting(next, context)
              : next);
    }
    var vote = (AbsurdPokedexAction.Vote) action;
    if (state.phase() != GamePhase.VOTING || deadlinePassed(state, context)) {
      return GameActionResult.reject(state, "La votación no está activa.");
    }
    var entry = entryById(state, vote.entryId());
    if (entry == null) return GameActionResult.reject(state, "Esa entrada no existe.");
    if (playerId.equals(entry.authorId())) return GameActionResult.reject(state, "No puedes votar tu propia entrada.");
    if (state.votes().containsKey(playerId)) return GameActionResult.reject(state, "Ya has votado.");
    if (vote.funnyEntryId() != null) {
      if (state.config().mode() != AbsurdPokedexMode.REAL_ENTRY) {
        return GameActionResult.reject(state, "La más graciosa solo se vota en «¿Cuál es la real?».");
      }
      var funny = entryById(state, vote.funnyEntryId());
      if (funny == null) return GameActionResult.reject(state, "Esa entrada no existe.");
      // La propia ya la conoce; rechazar la oficial le diría cuál es, así que esa se acepta y no cuenta.
      if (playerId.equals(funny.authorId())) {
        return GameActionResult.reject(state, "La más graciosa tiene que ser una entrada inventada por otro jugador.");
      }
    }
    var votes = new LinkedHashMap<>(state.votes());
    votes.put(playerId, vote.entryId());
    var funnyVotes = new LinkedHashMap<>(state.funnyVotes());
    var funnyPicks = new LinkedHashMap<>(state.funnyPicks());
    if (vote.funnyEntryId() != null) {
      funnyPicks.put(playerId, vote.funnyEntryId());
      if (!entryById(state, vote.funnyEntryId()).isReal()) funnyVotes.put(playerId, vote.funnyEntryId());
    }
    var next = state.toBuilder().votes(votes).funnyVotes(funnyVotes).funnyPicks(funnyPicks).build();
    return GameActionResult.accept(allEligibleVoted(next, context) ? resolveVote(next, context) : next);
  }

  /** Dos fases activas con plazo propio (escritura y voto): se escribe a mano, como La Frase. */
  @Override
  public AbsurdPokedexState handleTimeout(AbsurdPokedexState state, GameContext context) {
    boolean activeDeadline = state.roundEndsAt() != null && context.now() >= state.roundEndsAt();
    if (state.phase() == GamePhase.ROUND_ACTIVE && activeDeadline) return beginVoting(state, context);
    if (state.phase() == GamePhase.VOTING && activeDeadline) return resolveVote(state, context);
    if (state.phase() == GamePhase.ROUND_RESULTS && state.nextTransitionAt() != null
        && context.now() >= state.nextTransitionAt()) {
      return beginRound(state, context);
    }
    return state;
  }

  @Override
  public AbsurdPokedexState handlePresenceChange(AbsurdPokedexState state, GameContext context) {
    if (state.phase() == GamePhase.ROUND_ACTIVE
        && context.allConnectedRequiredCompleted(state.playerIds(), state.submissions()::containsKey)) {
      return beginVoting(state, context);
    }
    if (state.phase() == GamePhase.VOTING && allEligibleVoted(state, context)) return resolveVote(state, context);
    return state;
  }

  @Override
  public AbsurdPokedexPublicState getPublicState(AbsurdPokedexState state, GameContext context) {
    boolean results = state.phase() == GamePhase.ROUND_RESULTS || state.phase() == GamePhase.GAME_RESULTS;
    var entries = state.phase() == GamePhase.VOTING
        ? state.entries().stream().map(entry -> new AbsurdPokedexEntryView(entry.id(), entry.text())).toList()
        : List.<AbsurdPokedexEntryView>of();
    return AbsurdPokedexPublicState.builder()
        .gameId(ID)
        .phase(state.phase())
        .mode(state.config().mode())
        .roundNumber(state.roundNumber())
        .totalRounds(state.config().rounds())
        .pokemon(state.currentPokemon())
        .playerIds(state.playerIds())
        .submittedPlayerIds(state.playerIds().stream().filter(state.submissions()::containsKey).toList())
        .votedPlayerIds(state.playerIds().stream().filter(state.votes()::containsKey).toList())
        .entries(entries)
        .scores(state.scores())
        .roundEndsAt(state.roundEndsAt())
        .nextTransitionAt(state.nextTransitionAt())
        .lastRound(results ? state.lastRound() : null)
        .results(state.phase() == GamePhase.GAME_RESULTS ? AbsurdPokedexRules.buildResults(state) : null)
        .build();
  }

  /**
   * {@code ownEntry} lleva el texto tal como lo ven los demás (tapado en {@code REAL_ENTRY}) y su {@code id} solo
   * desde la votación. {@code ownFunnyEntryId} es la graciosa tal como la marcó, aunque fuera la oficial y no cuente.
   */
  @Override
  public AbsurdPokedexPlayerState getPlayerState(AbsurdPokedexState state, String playerId, GameContext context) {
    if (!state.playerIds().contains(playerId) || !context.isPlayerRequired(playerId)) {
      return AbsurdPokedexPlayerState.SPECTATOR;
    }
    var submitted = state.submissions().get(playerId);
    var shown = state.entries().stream().filter(entry -> playerId.equals(entry.authorId())).findFirst().orElse(null);
    var ownEntry = shown != null
        ? new AbsurdPokedexOwnEntry(shown.id(), shown.text())
        : submitted != null ? new AbsurdPokedexOwnEntry(null, submitted) : null;
    return new AbsurdPokedexPlayerState(
        "PLAYER",
        state.phase() == GamePhase.ROUND_ACTIVE && submitted == null,
        state.drafts().getOrDefault(playerId, ""),
        ownEntry,
        state.phase() == GamePhase.VOTING && !state.votes().containsKey(playerId),
        state.votes().get(playerId),
        state.funnyPicks().get(playerId));
  }

  @Override
  public GameLifecycle getLifecycle(AbsurdPokedexState state) {
    return TimedLifecycle.builder(state.phase())
        .roundEndsAt(state.roundEndsAt())
        .nextTransitionAt(state.nextTransitionAt())
        .roundNumber(state.roundNumber())
        .build();
  }

  @Override
  public boolean isFinished(AbsurdPokedexState state) {
    return state.phase() == GamePhase.GAME_RESULTS;
  }

  @Override
  public GameResults getResults(AbsurdPokedexState state) {
    return AbsurdPokedexRules.buildResults(state);
  }
}
