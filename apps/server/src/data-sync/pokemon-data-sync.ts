import { Prisma, type DataSyncMode } from '@prisma/client';
import { syncPokemonData } from '../../prisma/seed.js';
import { prisma } from '../db.js';
import type { DataSyncAdapter, SyncResult } from './types.js';
import { SyncHttpClient } from './http-client.js';

export class PokemonDataSync implements DataSyncAdapter {
  readonly source = 'POKEAPI' as const;
  constructor(private readonly http = new SyncHttpClient()) {}

  async run(mode: DataSyncMode): Promise<SyncResult> {
    const before = await prisma.pokemon.count();
    if (mode === 'INCREMENTAL') {
      const remote = await this.http.json<{ count: number }>('https://pokeapi.co/api/v2/pokemon-species?limit=1', 'PokéAPI species version');
      if (remote.count <= before) return { processed: 0, inserted: 0, updated: 0, skipped: before, datasetVersion: String(remote.count), details: { changeDetected: false } };
    }
    await syncPokemonData({ force: mode === 'FULL' });
    await this.backfillNormalizedData();
    const after = await prisma.pokemon.count();
    return {
      processed: after,
      inserted: Math.max(0, after - before),
      updated: Math.min(before, after),
      skipped: mode === 'INCREMENTAL' && after === before ? after : 0,
      datasetVersion: String(after),
    };
  }

  recordsAvailable(): Promise<number> { return prisma.pokemon.count({ where: { isDefault: true, hp: { gt: 0 } } }); }

  /** Keeps normalized query tables compatible with the established catalog.
   * Upserts make this safe for both migrated and freshly synchronized rows. */
  private async backfillNormalizedData(): Promise<void> {
    const rows = await prisma.pokemon.findMany({ select: { id: true, nationalDexNumber: true, generation: true, isDefault: true, name: true, names: true, color: true, legendaryStatus: true, types: true, abilities: true, sprite: true, metadata: true, hp: true, attack: true, defense: true, specialAttack: true, specialDefense: true, speed: true, baseStatTotal: true } });
    for (const generation of [...new Set(rows.map((row) => row.generation))]) {
      await prisma.pokemonGeneration.upsert({ where: { id: generation }, create: { id: generation, slug: `generation-${generation}`, name: `Generación ${generation}` }, update: {} });
    }
    const defaults = new Map(rows.filter((row) => row.isDefault).map((row) => [row.nationalDexNumber, row]));
    for (const row of defaults.values()) {
      await prisma.pokemonSpecies.upsert({
        where: { id: row.nationalDexNumber },
        create: { id: row.nationalDexNumber, slug: row.id, generationId: row.generation, name: row.name, names: row.names === null ? Prisma.JsonNull : row.names, color: row.color, isLegendary: row.legendaryStatus === 'LEGENDARY', isMythical: row.legendaryStatus === 'MYTHICAL' },
        update: { generationId: row.generation, name: row.name, names: row.names === null ? Prisma.JsonNull : row.names, color: row.color, isLegendary: row.legendaryStatus === 'LEGENDARY', isMythical: row.legendaryStatus === 'MYTHICAL' },
      });
    }
    for (const row of rows) {
      await prisma.pokemon.update({ where: { id: row.id }, data: { speciesId: row.nationalDexNumber, sourceUpdatedAt: new Date() } });
      await prisma.pokemonAssetReference.upsert({ where: { pokemonId_kind_url: { pokemonId: row.id, kind: 'SPRITE', url: row.sprite } }, create: { id: `sprite:${row.id}`, pokemonId: row.id, kind: 'SPRITE', url: row.sprite, isPrimary: true }, update: { isPrimary: true } });
      const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : {};
      for (const [kind, value] of [['SHINY_SPRITE', metadata.shinySprite], ['ARTWORK', metadata.artwork], ['HOME_ARTWORK', metadata.homeArtwork], ['CRY_LATEST', metadata.cries && typeof metadata.cries === 'object' && !Array.isArray(metadata.cries) ? metadata.cries.latest : null], ['CRY_LEGACY', metadata.cries && typeof metadata.cries === 'object' && !Array.isArray(metadata.cries) ? metadata.cries.legacy : null]] as const) {
        if (typeof value !== 'string' || !value) continue;
        await prisma.pokemonAssetReference.upsert({ where: { pokemonId_kind_url: { pokemonId: row.id, kind, url: value } }, create: { id: `${kind.toLocaleLowerCase()}:${row.id}`, pokemonId: row.id, kind, url: value, isPrimary: kind === 'ARTWORK' }, update: {} });
      }
      const stats = [['hp', row.hp], ['attack', row.attack], ['defense', row.defense], ['special-attack', row.specialAttack], ['special-defense', row.specialDefense], ['speed', row.speed], ['bst', row.baseStatTotal]] as const;
      await prisma.$transaction(stats.map(([stat, baseValue]) => prisma.pokemonStat.upsert({ where: { pokemonId_stat: { pokemonId: row.id, stat } }, create: { pokemonId: row.id, stat, baseValue }, update: { baseValue } })));
      for (const [index, typeId] of row.types.entries()) {
        await prisma.pokemonType.upsert({ where: { id: typeId }, create: { id: typeId, name: typeId }, update: {} });
        await prisma.pokemonTypeAssignment.upsert({ where: { pokemonId_typeId: { pokemonId: row.id, typeId } }, create: { pokemonId: row.id, typeId, slot: index + 1 }, update: { slot: index + 1 } });
      }
      for (const [index, name] of row.abilities.entries()) {
        const abilityId = name.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        await prisma.ability.upsert({ where: { id: abilityId }, create: { id: abilityId, name, names: { es: name } }, update: { name } });
        await prisma.pokemonAbility.upsert({ where: { pokemonId_abilityId: { pokemonId: row.id, abilityId } }, create: { pokemonId: row.id, abilityId, slot: index + 1 }, update: { slot: index + 1 } });
      }
    }
  }
}
