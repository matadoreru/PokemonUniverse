package es.pokemonuniverse.application.datasync.pokemon;

import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;

/**
 * {@code pokemon-relation-reconciler.ts}: reconcilia las relaciones ordenadas y únicas de un Pokémon (habilidades,
 * tipos, recursos gestionados y estadísticas) con la proyección remota exacta. Se ejecuta dentro de una transacción
 * ({@link PokemonCatalogStore#backfillPokemon}) para que borrados y sustituciones se deshagan juntos si algo falla.
 */
public final class PokemonRelationReconciler {

  private static final Locale SPANISH = Locale.forLanguageTag("es");
  /** {@code MANAGED_ASSET_KINDS}: solo estos tipos de recurso se borran o sustituyen. */
  public static final List<String> MANAGED_ASSET_KINDS =
      List.of("SPRITE", "SHINY_SPRITE", "ARTWORK", "HOME_ARTWORK", "CRY_LATEST", "CRY_LEGACY");

  public record DesiredAbility(String abilityId, String name, int slot, boolean isHidden) {}

  public record DesiredType(String typeId, int slot) {}

  public record DesiredAsset(String kind, String url, boolean isPrimary) {}

  public record DesiredStat(String stat, int baseValue, int effort) {}

  public record Input(String pokemonId, List<DesiredAbility> abilities, List<DesiredType> types,
      List<DesiredStat> stats, List<DesiredAsset> assets) {}

  private PokemonRelationReconciler() {}

  /** {@code reconcilePokemonRelations}. Lanza {@code Duplicate <etiqueta>: <valor>} ante huecos o claves repetidos. */
  public static void reconcile(PokemonRelationStore tx, Input input) {
    assertUnique(input.abilities(), DesiredAbility::slot, "ability slot");
    assertUnique(input.abilities(), DesiredAbility::abilityId, "Pokémon ability");
    assertUnique(input.types(), DesiredType::slot, "type slot");
    assertUnique(input.types(), DesiredType::typeId, "Pokémon type");
    assertUnique(input.assets(), DesiredAsset::kind, "managed asset kind");
    assertUnique(input.stats(), DesiredStat::stat, "stat");
    var pokemonId = input.pokemonId();

    for (var desired : input.abilities()) tx.upsertAbility(desired.abilityId(), desired.name());
    Map<Integer, String> abilityAtSlot = new HashMap<>();
    for (var desired : input.abilities()) abilityAtSlot.put(desired.slot(), desired.abilityId());
    var obsoleteAbilities = tx.abilitySlots(pokemonId).stream()
        .filter(item -> !Objects.equals(abilityAtSlot.get(item.slot()), item.id()))
        .map(PokemonRelationStore.Slot::id).toList();
    if (!obsoleteAbilities.isEmpty()) tx.deleteAbilities(pokemonId, obsoleteAbilities);
    for (var desired : input.abilities()) {
      tx.upsertPokemonAbility(pokemonId, desired.abilityId(), desired.slot(), desired.isHidden());
    }

    for (var desired : input.types()) tx.ensureType(desired.typeId());
    Map<Integer, String> typeAtSlot = new HashMap<>();
    for (var desired : input.types()) typeAtSlot.put(desired.slot(), desired.typeId());
    var obsoleteTypes = tx.typeSlots(pokemonId).stream()
        .filter(item -> !Objects.equals(typeAtSlot.get(item.slot()), item.id()))
        .map(PokemonRelationStore.Slot::id).toList();
    if (!obsoleteTypes.isEmpty()) tx.deleteTypes(pokemonId, obsoleteTypes);
    for (var desired : input.types()) tx.upsertTypeAssignment(pokemonId, desired.typeId(), desired.slot());

    Map<String, String> desiredKinds = new HashMap<>();
    for (var desired : input.assets()) desiredKinds.put(desired.kind(), desired.url());
    var obsoleteAssets = tx.managedAssets(pokemonId, MANAGED_ASSET_KINDS).stream()
        .filter(item -> !Objects.equals(desiredKinds.get(item.kind()), item.url()))
        .map(PokemonRelationStore.Asset::id).toList();
    if (!obsoleteAssets.isEmpty()) tx.deleteAssets(obsoleteAssets);
    for (var desired : input.assets()) {
      tx.upsertAsset(desired.kind().toLowerCase(Locale.ROOT) + ":" + pokemonId, pokemonId, desired.kind(),
          desired.url(), desired.isPrimary());
    }

    var desiredStats = new LinkedHashSet<String>();
    for (var desired : input.stats()) desiredStats.add(desired.stat());
    tx.deleteStatsExcept(pokemonId, List.copyOf(desiredStats));
    for (var desired : input.stats()) tx.upsertStat(pokemonId, desired.stat(), desired.baseValue(), desired.effort());
  }

  private static <T> void assertUnique(List<T> items, Function<T, Object> key, String label) {
    var seen = new HashSet<>();
    for (var item : items) {
      var value = key.apply(item);
      if (!seen.add(value)) throw new IllegalStateException("Duplicate " + label + ": " + value);
    }
  }

  /**
   * {@code fallbackAbilityId}: minúsculas {@code es}, NFD, sin U+0300–U+036F, cada racha fuera de {@code [a-z0-9]}
   * pasa a {@code -} y se quitan los guiones de los extremos.
   */
  public static String fallbackAbilityId(String name) {
    var decomposed = Normalizer.normalize(name.toLowerCase(SPANISH), Normalizer.Form.NFD);
    return decomposed.replaceAll("[\\u0300-\\u036f]", "").replaceAll("[^a-z0-9]+", "-").replaceAll("^-|-$", "");
  }

  /**
   * {@code desiredAbilitiesFromMetadata}: las relaciones válidas de {@code metadata.abilityRelations} (id y nombre
   * texto, {@code slot} entero ≥ 1, {@code isHidden === true}); si no queda ninguna, los nombres de reserva en
   * orden con huecos 1..n.
   */
  public static List<DesiredAbility> desiredAbilitiesFromMetadata(@Nullable JsonNode metadata, List<String> fallbackNames) {
    var parsed = new ArrayList<DesiredAbility>();
    var relations = metadata != null && metadata.isObject() ? metadata.get("abilityRelations") : null;
    if (relations != null && relations.isArray()) {
      for (var relation : relations.values()) {
        if (relation == null || !relation.isObject()) continue;
        var id = relation.get("id");
        var name = relation.get("name");
        var slot = relation.get("slot");
        if (id == null || !id.isString() || name == null || !name.isString() || !isPositiveInteger(slot)) continue;
        var hidden = relation.get("isHidden");
        parsed.add(new DesiredAbility(id.getStringValue(), name.getStringValue(), slot.getNumberValue().intValue(),
            hidden != null && hidden.isBoolean() && hidden.getBooleanValue()));
      }
    }
    if (!parsed.isEmpty()) return parsed;
    var fallback = new ArrayList<DesiredAbility>();
    for (int i = 0; i < fallbackNames.size(); i++) {
      var name = fallbackNames.get(i);
      fallback.add(new DesiredAbility(fallbackAbilityId(name), name, i + 1, false));
    }
    return fallback;
  }

  /** {@code typeof slot === 'number' && Number.isInteger(slot) && slot >= 1}. */
  private static boolean isPositiveInteger(@Nullable JsonNode slot) {
    if (slot == null || !slot.isNumber()) return false;
    double value = slot.getNumberValue().doubleValue();
    return Double.isFinite(value) && value == Math.floor(value) && value >= 1;
  }
}
