package es.pokemonuniverse.application.datasync.pokemon;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import es.pokemonuniverse.application.datasync.pokemon.PokemonRelationReconciler.DesiredAbility;
import es.pokemonuniverse.application.datasync.pokemon.PokemonRelationReconciler.DesiredAsset;
import es.pokemonuniverse.application.datasync.pokemon.PokemonRelationReconciler.DesiredStat;
import es.pokemonuniverse.application.datasync.pokemon.PokemonRelationReconciler.DesiredType;
import es.pokemonuniverse.application.datasync.pokemon.PokemonRelationReconciler.Input;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.function.Consumer;
import org.junit.jupiter.api.Test;

/** Port de {@code pokemon-relation-reconciler.test.ts}: un almacén en memoria con transacción (copia y confirma). */
class PokemonRelationReconcilerTest {

  record AbilityRow(String pokemonId, String abilityId, int slot, boolean isHidden) {}

  record TypeRow(String pokemonId, String typeId, int slot) {}

  record AssetRow(String id, String pokemonId, String kind, String url, boolean isPrimary) {}

  record StatRow(String pokemonId, String stat, int baseValue, int effort) {}

  /** Estado inmutable por copia: cada transacción trabaja sobre una copia que solo se confirma si no falla. */
  static final class State {
    List<AbilityRow> abilities = new ArrayList<>();
    List<TypeRow> types = new ArrayList<>();
    List<AssetRow> assets = new ArrayList<>();
    List<StatRow> stats = new ArrayList<>();
    List<String> abilityCatalog = new ArrayList<>();
    List<String> typeCatalog = new ArrayList<>();

    State copy() {
      var copy = new State();
      copy.abilities = new ArrayList<>(abilities);
      copy.types = new ArrayList<>(types);
      copy.assets = new ArrayList<>(assets);
      copy.stats = new ArrayList<>(stats);
      copy.abilityCatalog = new ArrayList<>(abilityCatalog);
      copy.typeCatalog = new ArrayList<>(typeCatalog);
      return copy;
    }

    List<Object> snapshot() {
      return List.of(abilities, types, assets, stats, abilityCatalog, typeCatalog);
    }
  }

  static final class FakeStore implements PokemonRelationStore {
    final State state;
    final boolean failOnStat;

    FakeStore(State state, boolean failOnStat) {
      this.state = state;
      this.failOnStat = failOnStat;
    }

    @Override
    public void upsertAbility(String id, String name) {
      if (!state.abilityCatalog.contains(id)) state.abilityCatalog.add(id);
    }

    @Override
    public List<Slot> abilitySlots(String pokemonId) {
      return state.abilities.stream().filter(row -> row.pokemonId().equals(pokemonId))
          .map(row -> new Slot(row.abilityId(), row.slot())).toList();
    }

    @Override
    public void deleteAbilities(String pokemonId, Collection<String> abilityIds) {
      state.abilities.removeIf(row -> row.pokemonId().equals(pokemonId) && abilityIds.contains(row.abilityId()));
    }

    @Override
    public void upsertPokemonAbility(String pokemonId, String abilityId, int slot, boolean hidden) {
      var target = new AbilityRow(pokemonId, abilityId, slot, hidden);
      state.abilities.replaceAll(row -> row.pokemonId().equals(pokemonId) && row.slot() == slot ? target : row);
      if (!state.abilities.contains(target)) state.abilities.add(target);
      // Clave primaria (pokemonId, abilityId).
      if (state.abilities.stream().filter(row -> row.pokemonId().equals(pokemonId) && row.abilityId().equals(abilityId)).count() > 1) {
        throw new IllegalStateException("duplicate pokemonId/abilityId");
      }
    }

    @Override
    public void ensureType(String id) {
      if (!state.typeCatalog.contains(id)) state.typeCatalog.add(id);
    }

    @Override
    public List<Slot> typeSlots(String pokemonId) {
      return state.types.stream().filter(row -> row.pokemonId().equals(pokemonId))
          .map(row -> new Slot(row.typeId(), row.slot())).toList();
    }

    @Override
    public void deleteTypes(String pokemonId, Collection<String> typeIds) {
      state.types.removeIf(row -> row.pokemonId().equals(pokemonId) && typeIds.contains(row.typeId()));
    }

    @Override
    public void upsertTypeAssignment(String pokemonId, String typeId, int slot) {
      var target = new TypeRow(pokemonId, typeId, slot);
      state.types.replaceAll(row -> row.pokemonId().equals(pokemonId) && row.slot() == slot ? target : row);
      if (!state.types.contains(target)) state.types.add(target);
    }

    @Override
    public List<Asset> managedAssets(String pokemonId, Collection<String> kinds) {
      return state.assets.stream().filter(row -> row.pokemonId().equals(pokemonId) && kinds.contains(row.kind()))
          .map(row -> new Asset(row.id(), row.kind(), row.url())).toList();
    }

    @Override
    public void deleteAssets(Collection<String> ids) {
      state.assets.removeIf(row -> ids.contains(row.id()));
    }

    @Override
    public void upsertAsset(String id, String pokemonId, String kind, String url, boolean primary) {
      for (int i = 0; i < state.assets.size(); i++) {
        var row = state.assets.get(i);
        if (row.pokemonId().equals(pokemonId) && row.kind().equals(kind) && row.url().equals(url)) {
          state.assets.set(i, new AssetRow(row.id(), pokemonId, kind, url, primary));
          return;
        }
      }
      state.assets.add(new AssetRow(id, pokemonId, kind, url, primary));
    }

    @Override
    public void deleteStatsExcept(String pokemonId, Collection<String> stats) {
      state.stats.removeIf(row -> row.pokemonId().equals(pokemonId) && !stats.contains(row.stat()));
    }

    @Override
    public void upsertStat(String pokemonId, String stat, int baseValue, int effort) {
      if (failOnStat) throw new IllegalStateException("stat write failed");
      var target = new StatRow(pokemonId, stat, baseValue, effort);
      state.stats.replaceAll(row -> row.pokemonId().equals(pokemonId) && row.stat().equals(stat) ? target : row);
      if (!state.stats.contains(target)) state.stats.add(target);
    }
  }

  private static void transaction(State[] state, Consumer<PokemonRelationStore> work, boolean failOnStat) {
    var working = state[0].copy();
    work.accept(new FakeStore(working, failOnStat));
    state[0] = working;
  }

  private static Input input(List<DesiredAbility> abilities) {
    return new Input("pikachu", abilities, List.of(new DesiredType("electric", 1)),
        List.of(new DesiredStat("hp", 35, 0)), List.of(new DesiredAsset("SPRITE", "https://assets/pikachu.png", true)));
  }

  @Test
  void keepsAnExistingAbilityInTheSameSlotAndIsIdempotentAcrossTwoPasses() {
    var state = new State[] {new State()};
    state[0].abilities.add(new AbilityRow("pikachu", "static", 1, false));
    var desired = input(List.of(new DesiredAbility("static", "Electricidad estática", 1, false)));
    transaction(state, tx -> PokemonRelationReconciler.reconcile(tx, desired), false);
    var once = state[0].copy().snapshot();
    transaction(state, tx -> PokemonRelationReconciler.reconcile(tx, desired), false);
    assertEquals(once, state[0].snapshot());
    assertEquals(List.of(new AbilityRow("pikachu", "static", 1, false)), state[0].abilities);
  }

  @Test
  void replacesTheAbilityOccupyingASlotWhenTheRemoteRelationChanges() {
    var state = new State[] {new State()};
    state[0].abilities.add(new AbilityRow("pikachu", "static", 1, false));
    transaction(state, tx -> PokemonRelationReconciler.reconcile(tx,
        input(List.of(new DesiredAbility("lightning-rod", "Pararrayos", 1, true)))), false);
    assertEquals(List.of(new AbilityRow("pikachu", "lightning-rod", 1, true)), state[0].abilities);
  }

  @Test
  void convergesFromAPartialDatasetAndPreservesRealSlots() {
    var state = new State[] {new State()};
    state[0].abilities.add(new AbilityRow("pikachu", "static", 1, false));
    var abilities = PokemonRelationReconciler.desiredAbilitiesFromMetadata(
        ExtractorsTest.read("/datasync/pokeapi/metadata-cases.json").get(0), List.of());
    transaction(state, tx -> PokemonRelationReconciler.reconcile(tx, input(abilities)), false);
    assertEquals(List.of(new AbilityRow("pikachu", "static", 1, false),
        new AbilityRow("pikachu", "lightning-rod", 3, true)), state[0].abilities);
  }

  @Test
  void alsoReplacesOrderedTypesAndSingletonAssetsWithoutUniqueConflicts() {
    var state = new State[] {new State()};
    state[0].types.add(new TypeRow("pikachu", "normal", 1));
    state[0].assets.add(new AssetRow("sprite:pikachu", "pikachu", "SPRITE", "old.png", true));
    transaction(state, tx -> PokemonRelationReconciler.reconcile(tx,
        input(List.of(new DesiredAbility("static", "Static", 1, false)))), false);
    assertEquals(List.of(new TypeRow("pikachu", "electric", 1)), state[0].types);
    assertEquals(List.of(new AssetRow("sprite:pikachu", "pikachu", "SPRITE", "https://assets/pikachu.png", true)),
        state[0].assets);
  }

  @Test
  void rollsBackEveryRelationIfALaterWriteFails() {
    var state = new State[] {new State()};
    state[0].abilities.add(new AbilityRow("pikachu", "static", 1, false));
    var before = state[0].copy().snapshot();
    var error = assertThrows(IllegalStateException.class, () -> transaction(state,
        tx -> PokemonRelationReconciler.reconcile(tx, input(List.of(new DesiredAbility("lightning-rod", "Pararrayos", 1, true)))),
        true));
    assertEquals("stat write failed", error.getMessage());
    assertEquals(before, state[0].snapshot());
  }

  @Test
  void duplicatesAreRejectedWithNodeMessages() {
    var tx = new FakeStore(new State(), false);
    var twoInSlot = new Input("p", List.of(new DesiredAbility("a", "A", 1, false), new DesiredAbility("b", "B", 1, false)),
        List.of(), List.of(), List.of());
    assertEquals("Duplicate ability slot: 1",
        assertThrows(IllegalStateException.class, () -> PokemonRelationReconciler.reconcile(tx, twoInSlot)).getMessage());
    var sameType = new Input("p", List.of(), List.of(new DesiredType("fire", 1), new DesiredType("fire", 2)), List.of(),
        List.of());
    assertEquals("Duplicate Pokémon type: fire",
        assertThrows(IllegalStateException.class, () -> PokemonRelationReconciler.reconcile(tx, sameType)).getMessage());
    var sameKind = new Input("p", List.of(), List.of(), List.of(),
        List.of(new DesiredAsset("SPRITE", "a", true), new DesiredAsset("SPRITE", "b", true)));
    assertEquals("Duplicate managed asset kind: SPRITE",
        assertThrows(IllegalStateException.class, () -> PokemonRelationReconciler.reconcile(tx, sameKind)).getMessage());
  }
}
