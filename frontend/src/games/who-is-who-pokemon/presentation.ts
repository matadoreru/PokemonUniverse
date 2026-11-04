import { WHO_IS_WHO_WIN_POINTS } from '@pokemon-universe/shared/public';
import type { WhoIsWhoGuess, WhoIsWhoPlayerState, WhoIsWhoPokemonCard, WhoIsWhoPublicState, WhoIsWhoTeam } from '@pokemon-universe/shared/public';

/** Textos, cálculos y disposición del tablero de Quién es Quién (puros: se prueban sin DOM). */

export const TEAMS: readonly WhoIsWhoTeam[] = ['BLUE', 'RED'];
export const TEAM_NAME: Record<WhoIsWhoTeam, string> = { BLUE: 'Equipo Azul', RED: 'Equipo Rojo' };
/** Color de cada equipo (tokens): nunca va solo, siempre con el nombre del equipo. */
export const TEAM_COLOR: Record<WhoIsWhoTeam, string> = { BLUE: 'var(--blue)', RED: 'var(--red)' };
export const otherTeam = (team: WhoIsWhoTeam): WhoIsWhoTeam => (team === 'BLUE' ? 'RED' : 'BLUE');

export const secretsReady = (game: Pick<WhoIsWhoPublicState, 'teams'>): boolean => game.teams.BLUE.secretReady && game.teams.RED.secretReady;

/** Insignia de la placa: «Ronda 2 de 25 · Turno 3». */
export function whoRoundLabel(game: Pick<WhoIsWhoPublicState, 'roundNumber' | 'totalRounds' | 'turnNumber'>): string {
  return `Ronda ${game.roundNumber} de ${game.totalRounds} · Turno ${game.turnNumber}`;
}

/** Rol de quien mira: su equipo tiene el turno, espera al otro o observa (espectador). */
export type WhoRole = 'turn' | 'waiting' | 'watcher';
export function whoRole(game: Pick<WhoIsWhoPublicState, 'currentTeam'>, player: Pick<WhoIsWhoPlayerState, 'team'> | null): WhoRole {
  if (!player?.team) return 'watcher';
  return player.team === game.currentTeam ? 'turn' : 'waiting';
}

/** `h1` de la placa: una línea corta con la fase o de quién es el turno. */
export function whoHeading(game: Pick<WhoIsWhoPublicState, 'currentTeam' | 'teams'>, player: Pick<WhoIsWhoPlayerState, 'team' | 'canChooseSecret'> | null): string {
  if (!secretsReady(game)) return player?.canChooseSecret ? 'Elegid vuestro Pokémon secreto' : 'Esperando los secretos';
  const role = whoRole(game, player);
  if (role === 'turn') return 'Vuestro turno';
  return `Turno del ${TEAM_NAME[game.currentTeam]}`;
}

/** Último intento de la partida si cerró el turno anterior (un fallo pasa el turno): lo que cuenta la placa y la región viva. */
export function previousTurnGuess(game: Pick<WhoIsWhoPublicState, 'guesses' | 'turnNumber'>): WhoIsWhoGuess | null {
  const last = game.guesses.at(-1);
  return last && last.turnNumber === game.turnNumber - 1 ? last : null;
}

const pokemonName = (board: readonly WhoIsWhoPokemonCard[], id: string) => board.find((pokemon) => pokemon.id === id)?.name ?? 'un Pokémon';

/** «Jose (Equipo Azul) probó Pikachu: no era.» */
export function guessSentence(guess: WhoIsWhoGuess, board: readonly WhoIsWhoPokemonCard[], nameOf: (id: string) => string): string {
  return `${nameOf(guess.playerId)} (${TEAM_NAME[guess.team]}) probó ${pokemonName(board, guess.pokemonId)}: ${guess.correct ? '¡acertó!' : 'no era.'}`;
}

/**
 * Texto de la única región viva: el fallo que cerró el turno anterior (si lo hubo) y de quién es el turno; antes de
 * empezar, qué falta para los secretos. Cambia con el turno, no con cada carta bajada.
 */
export function whoAnnouncement({ game, player, nameOf }: { game: WhoIsWhoPublicState; player: WhoIsWhoPlayerState | null; nameOf: (id: string) => string }): string {
  if (!secretsReady(game)) {
    if (player?.canChooseSecret) return 'Elegid el Pokémon secreto de vuestro equipo para empezar.';
    return 'Esperando a que ambos equipos elijan su Pokémon secreto.';
  }
  const guess = previousTurnGuess(game);
  const role = whoRole(game, player);
  const turn = role === 'turn' ? `Turno ${game.turnNumber}: os toca a vosotros.` : `Turno ${game.turnNumber}: le toca al ${TEAM_NAME[game.currentTeam]}.`;
  return guess ? `${guessSentence(guess, game.board, nameOf)} ${turn}` : turn;
}

/** Estado de un equipo en texto (columna lateral): turno o espera, y si ya tiene su secreto. */
export function teamStatus(game: Pick<WhoIsWhoPublicState, 'teams' | 'currentTeam'>, team: WhoIsWhoTeam): { text: string; tone: 'warn' | 'neutral' | 'info' } {
  if (!secretsReady(game)) return game.teams[team].secretReady ? { text: 'Secreto elegido', tone: 'info' } : { text: 'Eligiendo secreto', tone: 'neutral' };
  return game.currentTeam === team ? { text: 'Tiene el turno', tone: 'warn' } : { text: 'Espera', tone: 'neutral' };
}

/** «3 de 24 bajadas». */
export function downCountText(down: number, total: number): string {
  return `${down} de ${total} ${total === 1 ? 'bajada' : 'bajadas'}`;
}

/** Línea de estadísticas de un jugador en los resultados. */
export function whoStatsLine(stats: Readonly<Record<string, number | undefined>>): string {
  // `turnsPlayed` del motor cuenta los intentos de adivinar (sube con cada uno), no los turnos: no se repite aquí.
  const right = stats.correctGuesses ?? 0;
  const wrong = stats.incorrectGuesses ?? 0;
  if (right + wrong === 0) return 'Sin intentos de adivinar';
  return `${right} ${right === 1 ? 'acierto' : 'aciertos'} · ${wrong} ${wrong === 1 ? 'fallo' : 'fallos'}`;
}

/** Título de los resultados. */
export function whoResultTitle(winner: WhoIsWhoTeam | null): string {
  return winner ? `¡Ganó el ${TEAM_NAME[winner]}!` : 'Empate';
}

/** Regla de los puntos bajo la clasificación: cómo se ganó (o por qué nadie suma). */
export function whoResultRule(winner: WhoIsWhoTeam | null, guessed: boolean): string {
  if (!winner) return 'Se acabaron las rondas sin que nadie adivinara el secreto rival: nadie suma puntos.';
  const how = guessed ? `El ${TEAM_NAME[winner]} adivinó el secreto rival` : `El ${TEAM_NAME[winner]} gana porque el otro equipo se quedó sin jugadores`;
  return `${how}: cada uno de sus jugadores suma ${WHO_IS_WHO_WIN_POINTS} puntos.`;
}

// ── Tablero ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Alto de una carta por cada píxel de ancho (sprite, nombre y la marca «Bajada»). */
export const CARD_RATIO = 1.15;
/** Ancho mínimo de una carta: por debajo el tablero no encoge más y se desplaza dentro de su panel. */
export const CARD_MIN = 62;
/** Ancho máximo de una carta: con pocas cartas no crecen sin fin. */
export const CARD_MAX = 200;

export interface BoardLayout {
  columns: number;
  /** Ancho (y alto, con `CARD_RATIO`) de cada carta en px. */
  card: number;
  /** ¿Cabe entero sin desplazarse? */
  fits: boolean;
}

/**
 * Disposición del tablero en el hueco medido (`width` × `height`, con `gap` entre cartas): las columnas que dan la
 * carta más grande sin desplazar. Si ni así llegan al mínimo, tantas columnas como quepan con el mínimo y el panel se
 * desplaza por dentro (tableros de 36 o 50 en escritorio bajo o en el móvil).
 */
export function boardLayout(count: number, width: number, height: number, gap: number): BoardLayout {
  const n = Math.max(1, Math.floor(count));
  if (!(width > 0) || !(height > 0)) return { columns: Math.min(n, 6), card: CARD_MIN, fits: false };
  let best = { columns: 1, card: 0 };
  for (let columns = 1; columns <= n; columns++) {
    const rows = Math.ceil(n / columns);
    const cellW = (width - (columns - 1) * gap) / columns;
    const cellH = (height - (rows - 1) * gap) / rows;
    const card = Math.min(cellW, cellH / CARD_RATIO, CARD_MAX);
    if (card > best.card) best = { columns, card };
  }
  if (best.card >= CARD_MIN) return { columns: best.columns, card: Math.floor(best.card), fits: true };
  const columns = Math.max(1, Math.min(n, Math.floor((width + gap) / (CARD_MIN + gap))));
  const card = Math.min(CARD_MAX, Math.floor((width - (columns - 1) * gap) / columns));
  return { columns, card: Math.max(1, card), fits: false };
}

/** Alto que necesita la etiqueta del cursor encima de la punta (si no, va al lado, a la altura de la punta). */
export const CURSOR_LABEL_ROOM = 44;
/** A los 1,5 s sin moverse la etiqueta se apaga y queda la flecha de color. */
export const CURSOR_LABEL_MS = 1_500;

/**
 * Etiqueta del cursor de un compañero: encima de la punta, o al lado y a su altura si no cabe encima (primera fila).
 * Nunca debajo: así no tapa la franja del nombre de la carta señalada, que está abajo. Apagada si lleva 1,5 s quieto.
 */
export function cursorLabel(top: number, sinceMoveMs: number): { beside: boolean; quiet: boolean } {
  return { beside: top < CURSOR_LABEL_ROOM, quiet: sinceMoveMs > CURSOR_LABEL_MS };
}

/** Foco itinerante del tablero: índice al que lleva la tecla, o `null` si la tecla no mueve. */
export function boardMove(index: number, key: string, columns: number, count: number): number | null {
  const cols = Math.max(1, columns);
  switch (key) {
    case 'ArrowRight': return Math.min(count - 1, index + 1);
    case 'ArrowLeft': return Math.max(0, index - 1);
    case 'ArrowDown': return index + cols < count ? index + cols : index;
    case 'ArrowUp': return index - cols >= 0 ? index - cols : index;
    case 'Home': return 0;
    case 'End': return count - 1;
    default: return null;
  }
}

/** Clave del foco (`useFocusOnTransition`): cambia con el turno, al tener los secretos y al cerrar un diálogo. */
export function whoFocusKey(game: Pick<WhoIsWhoPublicState, 'turnNumber' | 'currentTeam' | 'teams'>, dialogOpen: boolean): string {
  return `${secretsReady(game) ? 'turno' : 'secretos'}-${game.turnNumber}-${game.currentTeam}-${dialogOpen ? 'dialogo' : 'tablero'}`;
}
