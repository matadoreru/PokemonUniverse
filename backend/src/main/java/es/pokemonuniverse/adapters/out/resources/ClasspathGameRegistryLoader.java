package es.pokemonuniverse.adapters.out.resources;

import es.pokemonuniverse.domain.game.GameManifest;
import es.pokemonuniverse.domain.game.GameRegistry;
import es.pokemonuniverse.domain.game.engine.GameEngine;
import es.pokemonuniverse.domain.game.engines.absurdpokedex.AbsurdPokedexEngine;
import es.pokemonuniverse.domain.game.engines.guessfromstats.GuessFromStatsEngine;
import es.pokemonuniverse.domain.game.engines.higherlower.HigherLowerEngine;
import es.pokemonuniverse.domain.game.engines.learnsetguess.LearnsetGuessEngine;
import es.pokemonuniverse.domain.game.engines.mostlikelyto.MostLikelyToEngine;
import es.pokemonuniverse.domain.game.engines.oneofusisfake.OneOfUsIsFakeEngine;
import es.pokemonuniverse.domain.game.engines.pokeddlerace.PokeddleRaceEngine;
import es.pokemonuniverse.domain.game.engines.pokedexdistance.PokedexDistanceEngine;
import es.pokemonuniverse.domain.game.engines.pokedexentryguess.PokedexEntryGuessEngine;
import es.pokemonuniverse.domain.game.engines.pokemonbingo.PokemonBingoEngine;
import es.pokemonuniverse.domain.game.engines.pokemonbluffauction.PokemonBluffAuctionEngine;
import es.pokemonuniverse.domain.game.engines.pokemonconnections.PokemonConnectionsEngine;
import es.pokemonuniverse.domain.game.engines.pokemoncryquiz.PokemonCryQuizEngine;
import es.pokemonuniverse.domain.game.engines.pokemonimpostor.PokemonImpostorEngine;
import es.pokemonuniverse.domain.game.engines.pokemonpaletteguess.PokemonPaletteGuessEngine;
import es.pokemonuniverse.domain.game.engines.pokemonredflag.PokemonRedFlagEngine;
import es.pokemonuniverse.domain.game.engines.pokemonteamauction.PokemonTeamAuctionEngine;
import es.pokemonuniverse.domain.game.engines.pokemontrivia.PokemonTriviaEngine;
import es.pokemonuniverse.domain.game.engines.poketaboo.PokeTabooEngine;
import es.pokemonuniverse.domain.game.engines.secretranking.SecretRankingEngine;
import es.pokemonuniverse.domain.game.engines.shinyvote.ShinyVoteEngine;
import es.pokemonuniverse.domain.game.engines.sketchmon.SketchmonEngine;
import es.pokemonuniverse.domain.game.engines.tcghigherlower.TcgHigherLowerEngine;
import es.pokemonuniverse.domain.game.engines.typechain.TypeChainEngine;
import es.pokemonuniverse.domain.game.engines.typeduel.TypeDuelEngine;
import es.pokemonuniverse.domain.game.engines.whoiswhopokemon.WhoIsWhoPokemonEngine;
import es.pokemonuniverse.domain.game.engines.whosthatpokemon.WhosThatPokemonEngine;
import es.pokemonuniverse.domain.game.engines.wouldyourather.WouldYouRatherEngine;
import es.pokemonuniverse.domain.game.engines.zoomedpokemon.ZoomedPokemonEngine;
import io.micronaut.context.annotation.Factory;
import io.micronaut.core.type.Argument;
import io.micronaut.serde.ObjectMapper;
import jakarta.inject.Singleton;
import java.io.IOException;
import java.io.InputStream;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Crea el bean {@link GameRegistry} a partir de {@code games/registry.json} (la fuente de los manifiestos y las
 * configuraciones por defecto; se edita a mano) y registra los motores, construidos con su manifiesto.
 */
@Factory
public class ClasspathGameRegistryLoader {

  static final String RESOURCE = "games/registry.json";

  @Singleton
  GameRegistry gameRegistry(ObjectMapper mapper) {
    return loadFromClasspath(mapper);
  }

  /** Lee {@code games/registry.json} del classpath; también lo usan los tests que construyen motores sin contenedor. */
  public static GameRegistry loadFromClasspath(ObjectMapper mapper) {
    try (InputStream in = ClasspathGameRegistryLoader.class.getClassLoader().getResourceAsStream(RESOURCE)) {
      if (in == null) {
        throw new IllegalStateException("Falta el recurso " + RESOURCE);
      }
      var manifests = load(mapper, in);
      return manifests.withEngines(portedEngines(manifests));
    } catch (IOException e) {
      throw new IllegalStateException("No se pudo leer " + RESOURCE, e);
    }
  }

  static GameRegistry load(ObjectMapper mapper, InputStream in) throws IOException {
    return new GameRegistry(mapper.readValue(in, Argument.listOf(GameManifest.class)));
  }

  /** Motores portados; único registro: añadir aquí cada motor nuevo (el arnés dorado lee este mismo mapa). */
  static Map<String, GameEngine<?, ?, ?, ?>> portedEngines(GameRegistry manifests) {
    var engines = new LinkedHashMap<String, GameEngine<?, ?, ?, ?>>();
    engines.put(HigherLowerEngine.ID, new HigherLowerEngine(manifest(manifests, HigherLowerEngine.ID)));
    engines.put(PokedexDistanceEngine.ID, new PokedexDistanceEngine(manifest(manifests, PokedexDistanceEngine.ID)));
    engines.put(GuessFromStatsEngine.ID, new GuessFromStatsEngine(manifest(manifests, GuessFromStatsEngine.ID)));
    engines.put(PokemonPaletteGuessEngine.ID,
        new PokemonPaletteGuessEngine(manifest(manifests, PokemonPaletteGuessEngine.ID)));
    engines.put(PokemonTriviaEngine.ID, new PokemonTriviaEngine(manifest(manifests, PokemonTriviaEngine.ID)));
    engines.put(TypeDuelEngine.ID, new TypeDuelEngine(manifest(manifests, TypeDuelEngine.ID)));
    engines.put(TypeChainEngine.ID, new TypeChainEngine(manifest(manifests, TypeChainEngine.ID)));
    engines.put(PokeddleRaceEngine.ID, new PokeddleRaceEngine(manifest(manifests, PokeddleRaceEngine.ID)));
    engines.put(PokemonRedFlagEngine.ID,
        new PokemonRedFlagEngine(manifest(manifests, PokemonRedFlagEngine.ID)));
    engines.put(PokeTabooEngine.ID, new PokeTabooEngine(manifest(manifests, PokeTabooEngine.ID)));
    engines.put(WouldYouRatherEngine.ID, new WouldYouRatherEngine(manifest(manifests, WouldYouRatherEngine.ID)));
    engines.put(MostLikelyToEngine.ID, new MostLikelyToEngine(manifest(manifests, MostLikelyToEngine.ID)));
    engines.put(SecretRankingEngine.ID, new SecretRankingEngine(manifest(manifests, SecretRankingEngine.ID)));
    engines.put(OneOfUsIsFakeEngine.ID, new OneOfUsIsFakeEngine(manifest(manifests, OneOfUsIsFakeEngine.ID)));
    engines.put(LearnsetGuessEngine.ID, new LearnsetGuessEngine(manifest(manifests, LearnsetGuessEngine.ID)));
    engines.put(PokedexEntryGuessEngine.ID,
        new PokedexEntryGuessEngine(manifest(manifests, PokedexEntryGuessEngine.ID)));
    engines.put(WhosThatPokemonEngine.ID, new WhosThatPokemonEngine(manifest(manifests, WhosThatPokemonEngine.ID)));
    engines.put(PokemonCryQuizEngine.ID, new PokemonCryQuizEngine(manifest(manifests, PokemonCryQuizEngine.ID)));
    engines.put(ZoomedPokemonEngine.ID, new ZoomedPokemonEngine(manifest(manifests, ZoomedPokemonEngine.ID)));
    engines.put(ShinyVoteEngine.ID, new ShinyVoteEngine(manifest(manifests, ShinyVoteEngine.ID)));
    engines.put(TcgHigherLowerEngine.ID, new TcgHigherLowerEngine(manifest(manifests, TcgHigherLowerEngine.ID)));
    engines.put(WhoIsWhoPokemonEngine.ID, new WhoIsWhoPokemonEngine(manifest(manifests, WhoIsWhoPokemonEngine.ID)));
    engines.put(PokemonBingoEngine.ID, new PokemonBingoEngine(manifest(manifests, PokemonBingoEngine.ID)));
    engines.put(PokemonTeamAuctionEngine.ID,
        new PokemonTeamAuctionEngine(manifest(manifests, PokemonTeamAuctionEngine.ID)));
    engines.put(PokemonBluffAuctionEngine.ID,
        new PokemonBluffAuctionEngine(manifest(manifests, PokemonBluffAuctionEngine.ID)));
    engines.put(PokemonConnectionsEngine.ID,
        new PokemonConnectionsEngine(manifest(manifests, PokemonConnectionsEngine.ID)));
    engines.put(PokemonImpostorEngine.ID, new PokemonImpostorEngine(manifest(manifests, PokemonImpostorEngine.ID)));
    engines.put(SketchmonEngine.ID, new SketchmonEngine(manifest(manifests, SketchmonEngine.ID)));
    engines.put(AbsurdPokedexEngine.ID, new AbsurdPokedexEngine(manifest(manifests, AbsurdPokedexEngine.ID)));
    return engines;
  }

  private static GameManifest manifest(GameRegistry manifests, String id) {
    return manifests.get(id).orElseThrow(() -> new IllegalStateException("Sin manifiesto para el motor " + id));
  }
}
