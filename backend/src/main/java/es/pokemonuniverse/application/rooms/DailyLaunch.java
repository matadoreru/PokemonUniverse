package es.pokemonuniverse.application.rooms;

import es.pokemonuniverse.domain.pokemon.PokemonCatalog;
import es.pokemonuniverse.domain.room.DailyRoom;
import io.micronaut.json.tree.JsonNode;
import java.util.function.DoubleSupplier;

/**
 * Lo que necesita {@link RoomCoordinator#startDaily}: la marca de la sala, la configuración fija del juego del día, el
 * catálogo fijado y el azar de la partida ({@code Mulberry32} de la semilla del día, la única fuente del motor).
 */
public record DailyLaunch(DailyRoom daily, JsonNode config, PokemonCatalog pokemon, DoubleSupplier random) {}
