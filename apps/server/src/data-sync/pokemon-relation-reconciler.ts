import type { Prisma, PrismaClient } from '@prisma/client';

type RelationClient = Prisma.TransactionClient | PrismaClient;

export interface DesiredPokemonAbility {
  abilityId: string;
  name: string;
  slot: number;
  isHidden: boolean;
}

export interface DesiredPokemonType { typeId: string; slot: number }
export interface DesiredPokemonAsset { kind: string; url: string; isPrimary: boolean }
export interface DesiredPokemonStat { stat: string; baseValue: number; effort?: number }

export interface PokemonRelationsInput {
  pokemonId: string;
  abilities: readonly DesiredPokemonAbility[];
  types: readonly DesiredPokemonType[];
  stats: readonly DesiredPokemonStat[];
  assets: readonly DesiredPokemonAsset[];
}

const MANAGED_ASSET_KINDS = ['SPRITE', 'SHINY_SPRITE', 'ARTWORK', 'HOME_ARTWORK', 'CRY_LATEST', 'CRY_LEGACY'] as const;

function assertUnique<T>(items: readonly T[], key: (item: T) => string | number, label: string): void {
  const seen = new Set<string | number>();
  for (const item of items) {
    const value = key(item);
    if (seen.has(value)) throw new Error(`Duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

/** Reconciles ordered and singleton Pokémon relations to the exact remote
 * projection. Call inside an interactive Prisma transaction so removals and
 * replacements roll back together if any later write fails. */
export async function reconcilePokemonRelations(transaction: RelationClient, input: PokemonRelationsInput): Promise<void> {
  assertUnique(input.abilities, (item) => item.slot, 'ability slot');
  assertUnique(input.abilities, (item) => item.abilityId, 'Pokémon ability');
  assertUnique(input.types, (item) => item.slot, 'type slot');
  assertUnique(input.types, (item) => item.typeId, 'Pokémon type');
  assertUnique(input.assets, (item) => item.kind, 'managed asset kind');
  assertUnique(input.stats, (item) => item.stat, 'stat');

  for (const desired of input.abilities) {
    await transaction.ability.upsert({ where: { id: desired.abilityId }, create: { id: desired.abilityId, name: desired.name, names: { es: desired.name } }, update: { name: desired.name } });
  }
  const currentAbilities = await transaction.pokemonAbility.findMany({ where: { pokemonId: input.pokemonId }, select: { abilityId: true, slot: true } });
  const abilityAtSlot = new Map(input.abilities.map((item) => [item.slot, item.abilityId]));
  const obsoleteAbilityIds = currentAbilities.filter((item) => abilityAtSlot.get(item.slot) !== item.abilityId).map((item) => item.abilityId);
  if (obsoleteAbilityIds.length) await transaction.pokemonAbility.deleteMany({ where: { pokemonId: input.pokemonId, abilityId: { in: obsoleteAbilityIds } } });
  for (const desired of input.abilities) {
    await transaction.pokemonAbility.upsert({
      where: { pokemonId_slot: { pokemonId: input.pokemonId, slot: desired.slot } },
      create: { pokemonId: input.pokemonId, abilityId: desired.abilityId, slot: desired.slot, isHidden: desired.isHidden },
      update: { abilityId: desired.abilityId, isHidden: desired.isHidden },
    });
  }

  for (const desired of input.types) await transaction.pokemonType.upsert({ where: { id: desired.typeId }, create: { id: desired.typeId, name: desired.typeId }, update: {} });
  const currentTypes = await transaction.pokemonTypeAssignment.findMany({ where: { pokemonId: input.pokemonId }, select: { typeId: true, slot: true } });
  const typeAtSlot = new Map(input.types.map((item) => [item.slot, item.typeId]));
  const obsoleteTypeIds = currentTypes.filter((item) => typeAtSlot.get(item.slot) !== item.typeId).map((item) => item.typeId);
  if (obsoleteTypeIds.length) await transaction.pokemonTypeAssignment.deleteMany({ where: { pokemonId: input.pokemonId, typeId: { in: obsoleteTypeIds } } });
  for (const desired of input.types) {
    await transaction.pokemonTypeAssignment.upsert({
      where: { pokemonId_slot: { pokemonId: input.pokemonId, slot: desired.slot } },
      create: { pokemonId: input.pokemonId, typeId: desired.typeId, slot: desired.slot },
      update: { typeId: desired.typeId },
    });
  }

  const desiredKinds = new Map(input.assets.map((item) => [item.kind, item.url]));
  const currentAssets = await transaction.pokemonAssetReference.findMany({ where: { pokemonId: input.pokemonId, kind: { in: [...MANAGED_ASSET_KINDS] } }, select: { id: true, kind: true, url: true } });
  const obsoleteAssetIds = currentAssets.filter((item) => desiredKinds.get(item.kind) !== item.url).map((item) => item.id);
  if (obsoleteAssetIds.length) await transaction.pokemonAssetReference.deleteMany({ where: { id: { in: obsoleteAssetIds } } });
  for (const desired of input.assets) {
    await transaction.pokemonAssetReference.upsert({
      where: { pokemonId_kind_url: { pokemonId: input.pokemonId, kind: desired.kind, url: desired.url } },
      create: { id: `${desired.kind.toLocaleLowerCase()}:${input.pokemonId}`, pokemonId: input.pokemonId, kind: desired.kind, url: desired.url, isPrimary: desired.isPrimary },
      update: { isPrimary: desired.isPrimary },
    });
  }

  const desiredStats = new Set(input.stats.map((item) => item.stat));
  await transaction.pokemonStat.deleteMany({ where: { pokemonId: input.pokemonId, stat: { notIn: [...desiredStats] } } });
  for (const desired of input.stats) {
    await transaction.pokemonStat.upsert({
      where: { pokemonId_stat: { pokemonId: input.pokemonId, stat: desired.stat } },
      create: { pokemonId: input.pokemonId, stat: desired.stat, baseValue: desired.baseValue, effort: desired.effort ?? 0 },
      update: { baseValue: desired.baseValue, effort: desired.effort ?? 0 },
    });
  }
}

export function fallbackAbilityId(name: string): string {
  return name.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function desiredAbilitiesFromMetadata(metadata: unknown, fallbackNames: readonly string[]): DesiredPokemonAbility[] {
  const record = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata as Record<string, unknown> : {};
  const source = Array.isArray(record.abilityRelations) ? record.abilityRelations : [];
  const parsed: DesiredPokemonAbility[] = source.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const relation = item as Record<string, unknown>;
    if (typeof relation.id !== 'string' || typeof relation.name !== 'string' || typeof relation.slot !== 'number' || !Number.isInteger(relation.slot) || relation.slot < 1) return [];
    return [{ abilityId: relation.id, name: relation.name, slot: relation.slot, isHidden: relation.isHidden === true }];
  });
  return parsed.length ? parsed : fallbackNames.map((name, index) => ({ abilityId: fallbackAbilityId(name), name, slot: index + 1, isHidden: false }));
}
