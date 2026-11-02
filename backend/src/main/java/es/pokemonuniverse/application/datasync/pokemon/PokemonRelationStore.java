package es.pokemonuniverse.application.datasync.pokemon;

import java.util.Collection;
import java.util.List;

/**
 * Operaciones de {@code reconcilePokemonRelations} dentro de una transacción ({@code Prisma.TransactionClient}); cada
 * método refleja una llamada Prisma del original.
 */
public interface PokemonRelationStore {

  record Slot(String id, int slot) {}

  record Asset(String id, String kind, String url) {}

  /** {@code ability.upsert}: crea {@code {id, name, names: {es: name}}}; al actualizar solo {@code name}. */
  void upsertAbility(String id, String name);

  List<Slot> abilitySlots(String pokemonId);

  void deleteAbilities(String pokemonId, Collection<String> abilityIds);

  /** Upsert por {@code (pokemonId, slot)}. */
  void upsertPokemonAbility(String pokemonId, String abilityId, int slot, boolean hidden);

  /** {@code pokemonType.upsert} con {@code name = id} y {@code update: {}}. */
  void ensureType(String id);

  List<Slot> typeSlots(String pokemonId);

  void deleteTypes(String pokemonId, Collection<String> typeIds);

  /** Upsert por {@code (pokemonId, slot)}. */
  void upsertTypeAssignment(String pokemonId, String typeId, int slot);

  List<Asset> managedAssets(String pokemonId, Collection<String> kinds);

  void deleteAssets(Collection<String> ids);

  /** Upsert por {@code (pokemonId, kind, url)}: crea con {@code id}; al actualizar solo {@code isPrimary}. */
  void upsertAsset(String id, String pokemonId, String kind, String url, boolean primary);

  void deleteStatsExcept(String pokemonId, Collection<String> stats);

  /** Upsert por {@code (pokemonId, stat)}. */
  void upsertStat(String pokemonId, String stat, int baseValue, int effort);
}
