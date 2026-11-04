import type { PokemonTeamAuctionPlayerState, PokemonTeamAuctionPublicState, TeamAuctionLotResult, TeamAuctionPokemon } from '@pokemon-universe/shared/public';
import type { AuctionAwardProps, BidBlockInput, BidEventLike } from '../../room/auction-kit';
import { amountText } from '../../room/auction-kit';

/**
 * Textos y cálculos de Pokémon Team Auction (puros, sin React). El motor no tiene fase de adjudicación: cierra el lote y
 * abre el siguiente en la misma actualización, así que la adjudicación sale del último `lotHistory`.
 */

export const TEAM_SIZE = 6;
export const PASS_RULE = 'Quien pasa vuelve a participar en el siguiente lote si aún tiene huecos.';

/** BST total de un equipo. */
export function teamBst(team: readonly TeamAuctionPokemon[]): number {
  return team.reduce((total, pokemon) => total + pokemon.baseStatTotal, 0);
}

/** «Legendario», «Mítico» o `null`. */
export function legendaryLabel(status: TeamAuctionPokemon['legendaryStatus']): string | null {
  if (status === 'LEGENDARY') return 'Legendario';
  if (status === 'MYTHICAL') return 'Mítico';
  return null;
}

/** Eventos de la puja del lote en juego (el historial del motor es de toda la partida). */
export function currentLotEvents(game: Pick<PokemonTeamAuctionPublicState, 'bidHistory' | 'lotNumber'>): BidEventLike[] {
  return game.bidHistory.filter((event) => event.lotNumber === game.lotNumber);
}

/** Último lote cerrado (o `null`). */
export function lastLot(game: Pick<PokemonTeamAuctionPublicState, 'lotHistory'>): TeamAuctionLotResult | null {
  return game.lotHistory.at(-1) ?? null;
}

/** Texto de un lote cerrado: «Charizard para Ana por 6 monedas» o «Mewtwo, sin dueño». */
export function lotResultText(lot: TeamAuctionLotResult, nameOf: (id: string) => string): string {
  return lot.winnerId ? `${lot.pokemon.name} para ${nameOf(lot.winnerId)} por ${amountText(lot.bid)}` : `${lot.pokemon.name}, sin dueño`;
}

/** Banda de la adjudicación del último lote cerrado. `fresh` mientras el lote nuevo no tiene pujas. */
export function teamAward(game: Pick<PokemonTeamAuctionPublicState, 'lotHistory' | 'currentBid'>, nameOf: (id: string) => string): AuctionAwardProps | null {
  const lot = lastLot(game);
  if (!lot) return null;
  const fresh = game.currentBid === null;
  return lot.winnerId
    ? { tone: 'won', kicker: `Lote ${lot.lotNumber} adjudicado`, title: `${lot.pokemon.name} para ${nameOf(lot.winnerId)}`, detail: `por ${amountText(lot.bid)}`, sprite: lot.pokemon.sprite, fresh }
    : { tone: 'unsold', kicker: `Lote ${lot.lotNumber} sin dueño`, title: lot.pokemon.name, detail: 'Nadie pujó', sprite: lot.pokemon.sprite, fresh };
}

/** Estado de un jugador en el lote, en texto (la franja de los presupuestos). */
export type TeamStatus = 'turn' | 'leading' | 'passed' | 'full' | 'noBudget' | 'bidding' | 'closed';

export function teamStatus(game: PokemonTeamAuctionPublicState, playerId: string): TeamStatus {
  const participant = game.participants[playerId];
  if (game.phase !== 'ROUND_ACTIVE' || !game.currentPokemon) return 'closed';
  if (participant && participant.team.length >= TEAM_SIZE) return 'full';
  if (game.currentBidderId === playerId) return 'leading';
  if (participant && participant.coins < game.minimumBid) return 'noBudget';
  if (game.passedPlayerIds.includes(playerId)) return 'passed';
  if (game.currentTurnPlayerId === playerId) return 'turn';
  return 'bidding';
}

export const TEAM_STATUS_TEXT: Record<TeamStatus, string> = {
  turn: 'Su turno',
  leading: 'Va ganando',
  passed: 'Pasó',
  full: 'Equipo completo',
  noBudget: 'Sin presupuesto',
  bidding: 'En la puja',
  closed: 'Subasta cerrada',
};

/** Entrada de `bidBlock` para el jugador (lo que dice el servidor más el contexto público). */
export function teamBlockInput(game: PokemonTeamAuctionPublicState, player: PokemonTeamAuctionPlayerState | null, selfId: string, nameOf: (id: string) => string): BidBlockInput {
  const participating = player?.role === 'PLAYER';
  const team = player?.team ?? game.participants[selfId]?.team ?? [];
  const turnName = game.currentTurnPlayerId && game.currentTurnPlayerId !== selfId ? nameOf(game.currentTurnPlayerId) : null;
  return {
    participating,
    open: game.phase === 'ROUND_ACTIVE' && game.currentPokemon !== null,
    canRaise: Boolean(player?.canRaise),
    canPass: Boolean(player?.canPass),
    leading: game.currentBidderId === selfId,
    passed: game.passedPlayerIds.includes(selfId),
    full: team.length >= TEAM_SIZE,
    min: game.minimumBid,
    max: player?.coins ?? 0,
    turnName,
  };
}

/** Título (`h1`) de la pantalla: «Tu turno», «Turno de Ana» o «Subasta cerrada». */
export function teamHeading(game: PokemonTeamAuctionPublicState, selfId: string, nameOf: (id: string) => string): string {
  if (game.phase !== 'ROUND_ACTIVE' || !game.currentTurnPlayerId) return 'Subasta cerrada';
  return game.currentTurnPlayerId === selfId ? 'Tu turno' : `Turno de ${nameOf(game.currentTurnPlayerId)}`;
}

/**
 * Texto de la única región viva: lo último que pasó. Con pujas en el lote, el último evento («Ana puja 5 monedas por
 * Pikachu.» / «Ana pasa.»); sin ellas, la adjudicación del lote anterior y el lote nuevo; y siempre de quién es el turno.
 */
export function teamAnnouncement(game: PokemonTeamAuctionPublicState, selfId: string, nameOf: (id: string) => string): string {
  if (game.phase !== 'ROUND_ACTIVE' || !game.currentPokemon) return 'La subasta ha terminado.';
  const events = currentLotEvents(game);
  const last = events.at(-1);
  const who = (id: string) => (id === selfId ? 'Tú' : nameOf(id));
  const parts: string[] = [];
  if (game.currentBid === null) {
    // Lote nuevo sin pujas: la adjudicación del anterior y el lote (los pases automáticos no la tapan).
    const lot = lastLot(game);
    if (lot) parts.push(`Lote ${lot.lotNumber}: ${lotResultText(lot, nameOf)}.`);
    parts.push(`Lote ${game.lotNumber} de ${game.totalLots}: ${game.currentPokemon.name}.`);
  } else if (last) {
    parts.push(last.type === 'BID' ? `${who(last.playerId)} ${last.playerId === selfId ? 'pujas' : 'puja'} ${amountText(last.amount)} por ${game.currentPokemon.name}.` : `${who(last.playerId)} ${last.playerId === selfId ? 'pasas' : 'pasa'}.`);
  }
  if (game.currentTurnPlayerId) parts.push(game.currentTurnPlayerId === selfId ? 'Es tu turno.' : `Turno de ${nameOf(game.currentTurnPlayerId)}.`);
  return parts.join(' ');
}

/** Línea de métricas de un puesto de los resultados. */
export function teamStatsLine(stats: Record<string, number | undefined>): string {
  const n = (key: string) => stats[key] ?? 0;
  const plural = (value: number, one: string, many: string) => `${value} ${value === 1 ? one : many}`;
  return [
    `BST ${n('bstTotal')}`,
    plural(n('pokemonWon'), 'Pokémon', 'Pokémon'),
    plural(n('legendaryCount'), 'legendario', 'legendarios'),
    plural(n('mythicalCount'), 'mítico', 'míticos'),
    amountText(n('coinsRemaining')),
    plural(n('lotsWon'), 'lote ganado', 'lotes ganados'),
  ].join(' · ');
}
