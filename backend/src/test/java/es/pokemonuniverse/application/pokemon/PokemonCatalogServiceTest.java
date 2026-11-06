package es.pokemonuniverse.application.pokemon;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.adapters.out.persistence.MoveEntity;
import es.pokemonuniverse.adapters.out.persistence.MoveRepository;
import es.pokemonuniverse.adapters.out.persistence.PokedexEntryEntity;
import es.pokemonuniverse.adapters.out.persistence.PokedexEntryRepository;
import es.pokemonuniverse.adapters.out.persistence.PokemonEntity;
import es.pokemonuniverse.adapters.out.persistence.PokemonEvolutionEntity;
import es.pokemonuniverse.adapters.out.persistence.PokemonEvolutionRepository;
import es.pokemonuniverse.adapters.out.persistence.PokemonLevelUpMoveEntity;
import es.pokemonuniverse.adapters.out.persistence.PokemonLevelUpMoveRepository;
import es.pokemonuniverse.adapters.out.persistence.PokemonRepository;
import es.pokemonuniverse.domain.pokemon.PokemonEvolutionInfo;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

@MicronautTest(transactional = false)
class PokemonCatalogServiceTest {

  private static final Instant NOW = Instant.parse("2026-01-01T00:00:00.123Z");
  private static final String POKEMON = "t2-bulbasaur";
  private static final String EVOLVED = "t2-ivysaur";
  private static final String[] MOVES = {"t2-placaje", "t2-gruñido"};

  @Inject PokemonRepository pokemonRepo;
  @Inject MoveRepository moveRepo;
  @Inject PokemonLevelUpMoveRepository learnsetRepo;
  @Inject PokedexEntryRepository pokedexRepo;
  @Inject PokemonEvolutionRepository evolutionRepo;
  @Inject PokemonCatalogService service;

  @BeforeEach
  void insert() {
    clean();
    // Número de dex alto para no chocar con un catálogo sembrado en la BD local.
    var bulbasaur = PokemonEntity.create(POKEMON, 9101, "bulbasaur", 1, true, new String[] {"overgrow"},
        new String[] {"grass", "poison"}, null, NOW);
    bulbasaur.setEvolution(1, 3);
    pokemonRepo.save(bulbasaur);
    var ivysaur = PokemonEntity.create(EVOLVED, 9102, "ivysaur", 1, true, new String[] {"overgrow"},
        new String[] {"grass", "poison"}, null, NOW);
    ivysaur.setEvolution(2, 3);
    pokemonRepo.save(ivysaur);
    evolutionRepo.save(PokemonEvolutionEntity.create("t2-chain", 9101, POKEMON, EVOLVED, NOW));
    moveRepo.save(MoveEntity.create(MOVES[0], "Placaje", "normal", "physical", Map.of("es", "Placaje"), NOW));
    moveRepo.save(MoveEntity.create(MOVES[1], "Gruñido", "normal", "status", null, NOW));
    learnsetRepo.save(PokemonLevelUpMoveEntity.create(POKEMON, MOVES[0], 1, 1));
    learnsetRepo.save(PokemonLevelUpMoveEntity.create(POKEMON, MOVES[1], 1, 1));
    learnsetRepo.save(PokemonLevelUpMoveEntity.create(POKEMON, MOVES[0], 2, 7));
    pokedexRepo.save(PokedexEntryEntity.create("t2-entry-yellow", POKEMON, "Una rara semilla.", "es", 1, "yellow",
        "Amarillo"));
    pokedexRepo.save(PokedexEntryEntity.create("t2-entry-crystal", POKEMON, "Lleva una semilla.", "es", 2, "crystal",
        "Cristal"));
    service.refresh();
  }

  @AfterEach
  void clean() {
    // Borrar el Pokémon arrastra en cascada sus movimientos por nivel, sus entradas de Pokédex y sus aristas.
    pokemonRepo.deleteById(POKEMON);
    pokemonRepo.deleteById(EVOLVED);
    for (var id : MOVES) moveRepo.deleteById(id);
    service.refresh();
  }

  @Test
  void loadsLearnsetsResolvedAndOrderedByLevelThenMoveName() {
    var gen1 = service.catalog().levelUpMoves(POKEMON, 1);
    assertEquals(List.of("Gruñido", "Placaje"), gen1.stream().map(m -> m.move().name()).toList());
    assertEquals(List.of(MOVES[1], MOVES[0]), gen1.stream().map(m -> m.moveId()).toList());
    assertEquals(Map.of("es", "Placaje"), gen1.get(1).move().names());
    assertEquals("status", gen1.get(0).move().category());
    var gen2 = service.catalog().levelUpMoves(POKEMON, 2);
    assertEquals(1, gen2.size());
    assertEquals(7, gen2.get(0).level());
    assertTrue(service.catalog().levelUpMoves(POKEMON, 3).isEmpty());
  }

  @Test
  void loadsPokedexEntriesNewestGenerationFirstAndEvolution() {
    var entries = service.catalog().pokedexEntries(POKEMON);
    assertEquals(List.of("crystal", "yellow"), entries.stream().map(e -> e.version()).toList());
    assertEquals("es", entries.get(0).language());
    assertEquals("Cristal", entries.get(0).versionLabel());
    assertEquals(Optional.of(new PokemonEvolutionInfo(1, 3)), service.catalog().evolutionInfo(POKEMON));
  }

  @Test
  void loadsTheEvolutionLinks() {
    assertEquals(Optional.of(POKEMON), service.catalog().preEvolutionId(EVOLVED));
    assertEquals(List.of(EVOLVED), service.catalog().evolutionIds(POKEMON));
  }

  @Test
  void cachesTheCatalogUntilRefresh() {
    var first = service.catalog();
    assertTrue(first == service.catalog());
    service.refresh();
    assertTrue(first != service.catalog());
  }
}
