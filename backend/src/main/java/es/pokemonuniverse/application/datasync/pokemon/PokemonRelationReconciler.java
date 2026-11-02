package es.pokemonuniverse.application.datasync.pokemon;

import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** {@code pokemon-relation-reconciler.ts}. */
public final class PokemonRelationReconciler {

  private static final Locale SPANISH = Locale.forLanguageTag("es");

  public record DesiredAbility(String abilityId, String name, int slot, boolean isHidden) {}

  private PokemonRelationReconciler() {}

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
