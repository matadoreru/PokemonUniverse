export const POKE_TABOO_GUESSER_MAX_POINTS = 5;
export const POKE_TABOO_GUESSER_MIN_POINTS = 1;
export const POKE_TABOO_DESCRIPTOR_POINTS = 2;

export function normalizeTabooText(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

/** Id sin la forma regional (los Tauros de Paldea, `tauros`): su nombre base también está prohibido. Lo usa también la web. */
export function tabooBaseId(id: string): string {
  return id.replace(/-(alola|galar|hisui|paldea)$/, '')
    .replace(/^tauros-paldea-(combat|blaze|aqua)-breed$/, 'tauros');
}
