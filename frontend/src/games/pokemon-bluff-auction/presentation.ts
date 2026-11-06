import type { BluffAuctionAttempt, BluffAuctionRoundResult, PokemonBluffAuctionPlayerState, PokemonBluffAuctionPublicState } from '@pokemon-universe/shared/public';
import type { BidBlockInput, BidBlockReason, TurnOrderEntry } from '../../room/auction-kit';
import { amountText, turnOrderEntries, waitTexts } from '../../room/auction-kit';

/**
 * Textos y cálculos de Pokémon Bluff Auction (puros, sin React). La subasta es de turnos: cada jugador sube cuántos
 * Pokémon de la condición sabe nombrar o pasa; quien queda con la puja más alta lo demuestra con el buscador y la ronda
 * acaba con su resultado: cumplió la apuesta o era un farol.
 *
 * Privacidad: lo único oculto es cuántos Pokémon cumplen la condición (`validPokemonCount` de `lastRound`, solo en las
 * apuestas imposibles). Aquí `lastRound` solo se lee en `ROUND_RESULTS` (`bluffRoundResult`).
 */

export const GAME_NAME = 'Pokémon Bluff Auction';
export const UNIT = 'Pokémon';
export const PASS_RULE = 'Sin desafíos: quien se queda con la puja más alta lo demuestra nombrando Pokémon.';
export const TIME_RULE = 'Acierto: +5 segundos · Fallo: −3 segundos.';

/** Textos de la placa de la puja propios de Bluff (los del kit hablan de lotes, presupuestos y equipos). */
export const BLUFF_BLOCK_TEXTS: Partial<Record<BidBlockReason, { title: string; text: string }>> = {
  watching: { title: 'Estás observando', text: 'La condición, las pujas y la demostración son públicas.' },
  closed: { title: 'Subasta cerrada', text: 'Esta ronda ya no admite pujas.' },
  passed: { title: 'Has pasado', text: 'Estás fuera de esta ronda: vuelves a pujar en la siguiente.' },
  noBudget: { title: 'Puja máxima', text: 'Nadie puede subir más: pasa para cerrar la subasta.' },
};

/** La ronda en juego tal como la expone el motor: `lastRound` solo en `ROUND_RESULTS` (si no, `null`). */
export function bluffRoundResult(game: Pick<PokemonBluffAuctionPublicState, 'phase' | 'lastRound'>): BluffAuctionRoundResult | null {
  return game.phase === 'ROUND_RESULTS' ? game.lastRound : null;
}

/** Entrada de `bidBlock` para el jugador: lo que dice el servidor más el contexto público. */
export function bluffBlockInput(game: PokemonBluffAuctionPublicState, player: PokemonBluffAuctionPlayerState | null, selfId: string, nameOf: (id: string) => string): BidBlockInput {
  const turnName = game.currentTurnPlayerId && game.currentTurnPlayerId !== selfId ? nameOf(game.currentTurnPlayerId) : null;
  return {
    participating: player?.role === 'PLAYER',
    open: game.phase === 'ROUND_ACTIVE' && game.condition !== null,
    canRaise: Boolean(player?.canRaise),
    canPass: Boolean(player?.canPass),
    leading: game.currentBidderId === selfId,
    passed: game.passedPlayerIds.includes(selfId),
    min: game.minimumBid,
    max: game.maxBid,
    turnName,
    unit: UNIT,
    texts: {
      ...BLUFF_BLOCK_TEXTS,
      // Sin turno propio, a quién le toca y cómo va la puja (sin controles grises).
      ...waitTexts({ turnName, currentBid: game.currentBid, leaderName: game.currentBidderId ? nameOf(game.currentBidderId) : null, unit: UNIT, passedText: 'Estás fuera de esta ronda: vuelves a pujar en la siguiente.', noBidsText: 'Aún no hay pujas en esta ronda.' }),
      open: { title: 'Tu turno', text: `Sube a ${game.minimumBid} o más, o pasa y quedas fuera de esta ronda.` },
    },
  };
}

/** Etiqueta del reloj de la subasta, el único sitio de la cabecera con el turno: «Tu turno», «Turno de Ana». */
export function bluffTimerLabel(game: Pick<PokemonBluffAuctionPublicState, 'currentTurnPlayerId'>, selfId: string, nameOf: (id: string) => string): string {
  if (!game.currentTurnPlayerId) return 'Turno de puja';
  return game.currentTurnPlayerId === selfId ? 'Tu turno' : `Turno de ${nameOf(game.currentTurnPlayerId)}`;
}

/** Fila del orden de turno de la subasta (vacía fuera de ella). */
export function bluffTurnOrder(game: PokemonBluffAuctionPublicState, selfId: string, nameOf: (id: string) => string): TurnOrderEntry[] {
  if (game.phase !== 'ROUND_ACTIVE' || !game.condition) return [];
  return turnOrderEntries({ order: game.bidOrder.length > 0 ? game.bidOrder : game.playerIds, turnId: game.currentTurnPlayerId, passedIds: game.passedPlayerIds, leaderId: game.currentBidderId }, nameOf, selfId);
}

/** Etiqueta del plazo del resultado de la ronda: tras la última ronda llega la clasificación, no otra ronda. */
export function bluffResultTimerLabel(game: Pick<PokemonBluffAuctionPublicState, 'roundNumber' | 'totalRounds'>): string {
  return game.roundNumber >= game.totalRounds ? 'Clasificación' : 'Siguiente ronda';
}

/** Fase en la insignia de la ronda. */
export function bluffPhaseName(phase: PokemonBluffAuctionPublicState['phase']): string {
  if (phase === 'POKEMON_SEARCH') return 'Demostración';
  if (phase === 'ROUND_RESULTS') return 'Resultado';
  return 'Subasta';
}

/** «Ronda 2 de 5 · Subasta». */
export function bluffRoundLabel(game: Pick<PokemonBluffAuctionPublicState, 'phase' | 'roundNumber' | 'totalRounds'>): string {
  const round = Math.min(Math.max(1, game.roundNumber), Math.max(1, game.totalRounds));
  return `Ronda ${round} de ${game.totalRounds} · ${bluffPhaseName(game.phase)}`;
}

/** Título de la ronda: si cumplió, si era imposible o si no llegó. */
export function bluffResultTitle(result: BluffAuctionRoundResult, nameOf: (id: string) => string): string {
  if (result.success) return `${nameOf(result.bidderId)} lo consiguió`;
  if (result.reason === 'IMPOSSIBLE') return 'Apuesta imposible';
  return `${nameOf(result.bidderId)} no lo consiguió`;
}

/** Por qué acabó así la ronda, en una frase (la cuenta de respuestas válidas solo existe en las imposibles). */
export function bluffResultReason(result: BluffAuctionRoundResult, nameOf: (id: string) => string): string {
  const bidder = nameOf(result.bidderId);
  switch (result.reason) {
    case 'COMPLETED': return `${bidder} nombró ${amountText(result.correctCount, UNIT)} correctos: cumplió su apuesta.`;
    case 'IMPOSSIBLE': return `${bidder} apostó ${result.bid}, pero solo existían ${result.validPokemonCount ?? 0} respuestas válidas.`;
    case 'BIDDER_LEFT': return `${bidder} abandonó la demostración.`;
    default: return `Se agotó el tiempo: ${result.correctCount} de ${result.bid} correctos.`;
  }
}

/**
 * `h1` de la pantalla: en la subasta, lo que se subasta (la condición; el turno va en el reloj); «Demuestra tu
 * apuesta», «Ana demuestra» o el resultado.
 */
export function bluffHeading(game: PokemonBluffAuctionPublicState, selfId: string, nameOf: (id: string) => string): string {
  const result = bluffRoundResult(game);
  if (result) return bluffResultTitle(result, nameOf);
  if (game.phase === 'POKEMON_SEARCH' && game.bidderId) return game.bidderId === selfId ? 'Demuestra tu apuesta' : `${nameOf(game.bidderId)} demuestra`;
  if (game.phase === 'ROUND_ACTIVE' && game.condition) return game.condition.description;
  if (game.phase === 'ROUND_ACTIVE' || game.phase === 'GAME_STARTING' || game.condition === null) return 'Preparando la ronda';
  return 'Subasta cerrada';
}

/** Estado de un jugador en la mesa de pujas (la columna lateral). */
export type BluffSeatStatus = 'leading' | 'passed' | 'bidding' | 'demonstrating' | 'waiting';

export function bluffSeatStatus(game: PokemonBluffAuctionPublicState, playerId: string): BluffSeatStatus {
  if (game.phase === 'POKEMON_SEARCH' || game.phase === 'ROUND_RESULTS') return game.bidderId === playerId ? 'demonstrating' : 'waiting';
  if (game.passedPlayerIds.includes(playerId)) return 'passed';
  // El turno no se repite en la mesa: vive en el reloj y en el orden de turno.
  if (game.currentBidderId === playerId) return 'leading';
  return 'bidding';
}

export const SEAT_STATUS_TEXT: Record<BluffSeatStatus, string> = {
  leading: 'Va ganando',
  passed: 'Fuera de la ronda',
  bidding: 'En la subasta',
  demonstrating: 'Demuestra',
  waiting: 'Mira la demostración',
};

/** Última puja de cada jugador en la ronda (la cifra de su franja en la mesa). */
export function latestBids(game: Pick<PokemonBluffAuctionPublicState, 'bidHistory'>): Map<string, number> {
  const latest = new Map<string, number>();
  for (const event of game.bidHistory) if (event.type === 'BID') latest.set(event.playerId, event.amount);
  return latest;
}

/** «Pikachu: correcto», «Pikachu: incorrecto», «Pikachu: ya utilizado». */
export const ATTEMPT_TEXT: Record<BluffAuctionAttempt['result'], string> = { CORRECT: 'Correcto', INCORRECT: 'Incorrecto', DUPLICATE: 'Ya utilizado' };

/**
 * Métricas de la demostración, las tres sobre la apuesta (la misma escala: un fallo no llena la barra de golpe):
 * correctos, los que faltan y los fallos (con más fallos que la apuesta, la barra se queda llena y la cifra lo dice).
 */
export function bluffMetrics({ correct, incorrect, target }: { correct: number; incorrect: number; target: number }) {
  const goal = Math.max(1, target);
  return [
    { key: 'correct', label: 'Correctos', value: correct, max: goal, text: `${correct} de ${goal}`, tone: 'ok' as const },
    { key: 'remaining', label: 'Faltan', value: Math.max(0, goal - correct), max: goal, text: `${Math.max(0, goal - correct)} de ${goal}`, tone: 'yellow' as const },
    { key: 'incorrect', label: 'Incorrectos', value: Math.min(incorrect, goal), max: goal, text: `${incorrect} ${incorrect === 1 ? 'fallo' : 'fallos'}`, tone: 'bad' as const },
  ];
}

/** Cómo le fue a cada jugador en la ronda: quien apostó cumplió o se marcó un farol; los demás ganan si falló. */
export interface BluffRoundLine {
  playerId: string;
  role: 'bidder' | 'rival';
  /** «Cumplió», «Farol», «Detectó el farol», «Sin puntos». */
  text: string;
  tone: 'ok' | 'bad' | 'neutral';
  points: number;
}

export function bluffRoundLines(result: BluffAuctionRoundResult, order: readonly string[]): BluffRoundLine[] {
  const ids = [result.bidderId, ...order.filter((id) => id !== result.bidderId)];
  return ids.map((playerId): BluffRoundLine => {
    const points = result.pointsAwarded[playerId] ?? 0;
    if (playerId === result.bidderId) return { playerId, role: 'bidder', text: result.success ? 'Cumplió' : 'Farol', tone: result.success ? 'ok' : 'bad', points };
    return { playerId, role: 'rival', text: result.success ? 'Sin puntos' : 'Gana la ronda', tone: result.success ? 'neutral' : 'ok', points };
  });
}

/** Veredicto propio para la placa de abajo en el resultado de la ronda. */
export function bluffSelfVerdict(result: BluffAuctionRoundResult, selfId: string, participating: boolean): { tone: 'ok' | 'bad' | 'info'; text: string; points: number } {
  const points = result.pointsAwarded[selfId] ?? 0;
  if (!participating || !(selfId in result.pointsAwarded)) return { tone: 'info', text: 'Resultado de la ronda', points: 0 };
  if (result.bidderId === selfId) return result.success ? { tone: 'ok', text: 'Cumpliste tu apuesta', points } : { tone: 'bad', text: 'Tu apuesta era un farol', points };
  return result.success ? { tone: 'bad', text: 'Cumplió su apuesta: no sumas', points } : { tone: 'ok', text: 'El farol te da puntos', points };
}

/**
 * Texto de la única región viva: lo último que pasó. En la subasta, la última puja o pase (o la condición nueva) y de
 * quién es el turno; en la demostración, el último intento; en el resultado, quién cumplió.
 */
export function bluffAnnouncement(game: PokemonBluffAuctionPublicState, selfId: string, nameOf: (id: string) => string): string {
  const who = (id: string) => (id === selfId ? 'Tú' : nameOf(id));
  const result = bluffRoundResult(game);
  if (result) {
    const bidderPoints = result.pointsAwarded[result.bidderId] ?? 0;
    const rival = Object.entries(result.pointsAwarded).find(([id]) => id !== result.bidderId)?.[1] ?? 0;
    return `${bluffResultTitle(result, nameOf)}. ${bluffResultReason(result, nameOf)} ${result.success ? `+${bidderPoints} para ${nameOf(result.bidderId)}.` : `+${rival} para cada rival.`}`;
  }
  if (game.phase === 'POKEMON_SEARCH' && game.bidderId) {
    const last = game.attempts.at(-1);
    const target = game.targetBid ?? 0;
    if (last) return `${who(game.bidderId)}: ${last.pokemon.name}, ${ATTEMPT_TEXT[last.result].toLowerCase()}. ${game.correctCount} de ${target}.`;
    return game.bidderId === selfId ? `Demuestra tu apuesta: nombra ${amountText(target, UNIT)} que cumplan la condición.` : `${nameOf(game.bidderId)} demuestra su apuesta de ${amountText(target, UNIT)}.`;
  }
  if (game.phase !== 'ROUND_ACTIVE' || !game.condition) return 'La subasta empieza en un momento.';
  const parts: string[] = [];
  const last = game.bidHistory.at(-1);
  if (!last) parts.push(`Ronda ${game.roundNumber} de ${game.totalRounds}: ${game.condition.description}.`);
  else parts.push(last.type === 'BID' ? `${who(last.playerId)} ${last.playerId === selfId ? 'pujas' : 'puja'} ${amountText(last.amount, UNIT)}.` : `${who(last.playerId)} ${last.playerId === selfId ? 'pasas' : 'pasa'}.`);
  if (game.currentTurnPlayerId) parts.push(game.currentTurnPlayerId === selfId ? 'Es tu turno.' : `Turno de ${nameOf(game.currentTurnPlayerId)}.`);
  return parts.join(' ');
}

/** Línea de métricas de un puesto de los resultados finales. */
export function bluffStatsLine(stats: Record<string, number | undefined>): string {
  const n = (key: string) => stats[key] ?? 0;
  const rounds = n('roundsWon');
  return [
    `${rounds} ${rounds === 1 ? 'ronda ganada' : 'rondas ganadas'}`,
    `${n('completedBids')}/${n('bidderRounds')} apuestas cumplidas`,
    `récord ${n('highestCompletedBid')}`,
    `${n('correctPokemon')} ${n('correctPokemon') === 1 ? 'correcto' : 'correctos'}`,
    `${n('impossibleBids')} ${n('impossibleBids') === 1 ? 'imposible' : 'imposibles'}`,
  ].join(' · ');
}
