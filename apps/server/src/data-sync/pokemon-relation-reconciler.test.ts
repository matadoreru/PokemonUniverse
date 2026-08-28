import { describe, expect, it } from 'vitest';
import { desiredAbilitiesFromMetadata, reconcilePokemonRelations, type PokemonRelationsInput } from './pokemon-relation-reconciler.js';

interface AbilityRow { pokemonId: string; abilityId: string; slot: number; isHidden: boolean }
interface TypeRow { pokemonId: string; typeId: string; slot: number }
interface AssetRow { id: string; pokemonId: string; kind: string; url: string; isPrimary: boolean }
interface StatRow { pokemonId: string; stat: string; baseValue: number; effort: number }
interface State { abilities: AbilityRow[]; types: TypeRow[]; assets: AssetRow[]; stats: StatRow[]; abilityCatalog: string[]; typeCatalog: string[] }

const clone = (state: State): State => structuredClone(state);
const emptyState = (): State => ({ abilities: [], types: [], assets: [], stats: [], abilityCatalog: [], typeCatalog: [] });

function client(state: State, failOnStat = false) {
  return {
    ability: { upsert: async ({ where }: { where: { id: string } }) => { if (!state.abilityCatalog.includes(where.id)) state.abilityCatalog.push(where.id); } },
    pokemonAbility: {
      findMany: async ({ where }: { where: { pokemonId: string } }) => state.abilities.filter((row) => row.pokemonId === where.pokemonId).map(({ abilityId, slot }) => ({ abilityId, slot })),
      deleteMany: async ({ where }: { where: { pokemonId: string; abilityId: { in: string[] } } }) => { state.abilities = state.abilities.filter((row) => row.pokemonId !== where.pokemonId || !where.abilityId.in.includes(row.abilityId)); },
      upsert: async ({ where, create, update }: { where: { pokemonId_slot: { pokemonId: string; slot: number } }; create: AbilityRow; update: Pick<AbilityRow, 'abilityId' | 'isHidden'> }) => {
        const key = where.pokemonId_slot; const row = state.abilities.find((item) => item.pokemonId === key.pokemonId && item.slot === key.slot);
        const target = row ?? { ...create }; if (row) Object.assign(row, update); else state.abilities.push(target);
        const duplicate = state.abilities.find((item) => item !== target && item.pokemonId === key.pokemonId && item.abilityId === target.abilityId);
        if (duplicate) throw new Error('duplicate pokemonId/abilityId');
      },
    },
    pokemonType: { upsert: async ({ where }: { where: { id: string } }) => { if (!state.typeCatalog.includes(where.id)) state.typeCatalog.push(where.id); } },
    pokemonTypeAssignment: {
      findMany: async ({ where }: { where: { pokemonId: string } }) => state.types.filter((row) => row.pokemonId === where.pokemonId).map(({ typeId, slot }) => ({ typeId, slot })),
      deleteMany: async ({ where }: { where: { pokemonId: string; typeId: { in: string[] } } }) => { state.types = state.types.filter((row) => row.pokemonId !== where.pokemonId || !where.typeId.in.includes(row.typeId)); },
      upsert: async ({ where, create, update }: { where: { pokemonId_slot: { pokemonId: string; slot: number } }; create: TypeRow; update: Pick<TypeRow, 'typeId'> }) => { const key = where.pokemonId_slot; const row = state.types.find((item) => item.pokemonId === key.pokemonId && item.slot === key.slot); if (row) Object.assign(row, update); else state.types.push({ ...create }); },
    },
    pokemonAssetReference: {
      findMany: async ({ where }: { where: { pokemonId: string } }) => state.assets.filter((row) => row.pokemonId === where.pokemonId).map(({ id, kind, url }) => ({ id, kind, url })),
      deleteMany: async ({ where }: { where: { id: { in: string[] } } }) => { state.assets = state.assets.filter((row) => !where.id.in.includes(row.id)); },
      upsert: async ({ where, create, update }: { where: { pokemonId_kind_url: { pokemonId: string; kind: string; url: string } }; create: AssetRow; update: Pick<AssetRow, 'isPrimary'> }) => { const key = where.pokemonId_kind_url; const row = state.assets.find((item) => item.pokemonId === key.pokemonId && item.kind === key.kind && item.url === key.url); if (row) Object.assign(row, update); else state.assets.push({ ...create }); },
    },
    pokemonStat: {
      deleteMany: async ({ where }: { where: { pokemonId: string; stat: { notIn: string[] } } }) => { state.stats = state.stats.filter((row) => row.pokemonId !== where.pokemonId || where.stat.notIn.includes(row.stat)); },
      upsert: async ({ where, create, update }: { where: { pokemonId_stat: { pokemonId: string; stat: string } }; create: StatRow; update: Pick<StatRow, 'baseValue' | 'effort'> }) => { if (failOnStat) throw new Error('stat write failed'); const key = where.pokemonId_stat; const row = state.stats.find((item) => item.pokemonId === key.pokemonId && item.stat === key.stat); if (row) Object.assign(row, update); else state.stats.push({ ...create }); },
    },
  };
}

const input = (abilities: PokemonRelationsInput['abilities']): PokemonRelationsInput => ({
  pokemonId: 'pikachu', abilities, types: [{ typeId: 'electric', slot: 1 }],
  stats: [{ stat: 'hp', baseValue: 35 }], assets: [{ kind: 'SPRITE', url: 'https://assets/pikachu.png', isPrimary: true }],
});

async function transaction(state: State, work: (tx: ReturnType<typeof client>) => Promise<void>, failOnStat = false): Promise<void> {
  const working = clone(state); await work(client(working, failOnStat)); Object.assign(state, working);
}

describe('Pokémon ordered relation reconciliation', () => {
  it('keeps an existing ability in the same slot and is idempotent across two Full Sync passes', async () => {
    const state = emptyState(); state.abilities.push({ pokemonId: 'pikachu', abilityId: 'static', slot: 1, isHidden: false });
    const desired = input([{ abilityId: 'static', name: 'Electricidad estática', slot: 1, isHidden: false }]);
    await transaction(state, (tx) => reconcilePokemonRelations(tx as never, desired)); const once = clone(state);
    await transaction(state, (tx) => reconcilePokemonRelations(tx as never, desired));
    expect(state).toEqual(once); expect(state.abilities).toEqual([{ pokemonId: 'pikachu', abilityId: 'static', slot: 1, isHidden: false }]);
  });

  it('replaces the ability occupying a slot when the remote relation changes', async () => {
    const state = emptyState(); state.abilities.push({ pokemonId: 'pikachu', abilityId: 'static', slot: 1, isHidden: false });
    await transaction(state, (tx) => reconcilePokemonRelations(tx as never, input([{ abilityId: 'lightning-rod', name: 'Pararrayos', slot: 1, isHidden: true }])));
    expect(state.abilities).toEqual([{ pokemonId: 'pikachu', abilityId: 'lightning-rod', slot: 1, isHidden: true }]);
  });

  it('converges from a partially populated local dataset and preserves real PokéAPI slots', async () => {
    const state = emptyState(); state.abilities.push({ pokemonId: 'pikachu', abilityId: 'static', slot: 1, isHidden: false });
    const abilities = desiredAbilitiesFromMetadata({ abilityRelations: [{ id: 'static', name: 'Electricidad estática', slot: 1, isHidden: false }, { id: 'lightning-rod', name: 'Pararrayos', slot: 3, isHidden: true }] }, []);
    await transaction(state, (tx) => reconcilePokemonRelations(tx as never, input(abilities)));
    expect(state.abilities).toEqual([
      { pokemonId: 'pikachu', abilityId: 'static', slot: 1, isHidden: false },
      { pokemonId: 'pikachu', abilityId: 'lightning-rod', slot: 3, isHidden: true },
    ]);
  });

  it('also replaces ordered types and singleton assets without unique conflicts', async () => {
    const state = emptyState(); state.types.push({ pokemonId: 'pikachu', typeId: 'normal', slot: 1 }); state.assets.push({ id: 'sprite:pikachu', pokemonId: 'pikachu', kind: 'SPRITE', url: 'old.png', isPrimary: true });
    await transaction(state, (tx) => reconcilePokemonRelations(tx as never, input([{ abilityId: 'static', name: 'Static', slot: 1, isHidden: false }])));
    expect(state.types).toEqual([{ pokemonId: 'pikachu', typeId: 'electric', slot: 1 }]);
    expect(state.assets).toEqual([{ id: 'sprite:pikachu', pokemonId: 'pikachu', kind: 'SPRITE', url: 'https://assets/pikachu.png', isPrimary: true }]);
  });

  it('rolls back every relation for the Pokémon if a later write fails', async () => {
    const state = emptyState(); state.abilities.push({ pokemonId: 'pikachu', abilityId: 'static', slot: 1, isHidden: false }); const before = clone(state);
    await expect(transaction(state, (tx) => reconcilePokemonRelations(tx as never, input([{ abilityId: 'lightning-rod', name: 'Pararrayos', slot: 1, isHidden: true }])), true)).rejects.toThrow('stat write failed');
    expect(state).toEqual(before);
  });
});
