/** Reto diario: contrato compartido con el backend y texto para compartir el resultado. */

/** El orden es contrato: es el de `DailyGames.all()` en Java. */
export const DAILY_GAME_IDS = ['pokedex-distance', 'shiny-vote', 'higher-lower', 'learnset-guess'] as const;
export type DailyGameId = (typeof DAILY_GAME_IDS)[number];

export type DailyStatus = 'AVAILABLE' | 'IN_PROGRESS' | 'FINISHED' | 'ABANDONED';

export interface DailyRoomInfo {
  gameId: DailyGameId;
  date: string;
  roundCount: number;
  result: { score: number; correct: number; rounds: number[] } | null;
}

export const DAILY_RULE_TEXT: Record<DailyGameId, string> = {
  'pokedex-distance': '5 objetivos · Por puntos',
  'higher-lower': '10 comparaciones',
  'shiny-vote': '10 rondas · 4 candidatos',
  'learnset-guess': '3 Pokémon · Revelación manual'
};

export function isDailyGameId(value: unknown): value is DailyGameId {
  return typeof value === 'string' && (DAILY_GAME_IDS as readonly string[]).includes(value);
}

/** `AAAA-MM-DD` a `dd/mm/aaaa`. */
export function formatDailyDate(date: string): string {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}

// Intl no agrupa los miles de 4 cifras en es-ES, así que se agrupa a mano.
function formatPoints(value: number): string {
  return String(Math.trunc(value)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export interface DailyShareInput {
  gameId: DailyGameId;
  date: string;
  score: number;
  correct: number;
  roundCount: number;
  rounds: readonly number[];
  origin: string;
}

function symbols(rounds: readonly number[], hit: string, miss: string, none: string): string {
  return rounds.map((value) => (value === 1 ? hit : value === 0 ? miss : none)).join('');
}

export function dailyShareText(input: DailyShareInput): string {
  const { gameId, score, correct, roundCount, rounds } = input;
  const pts = `${formatPoints(score)} pts`;
  let summary: string;
  let detail: string;
  switch (gameId) {
    case 'pokedex-distance':
      summary = `🎯 Pokédex Distance · ${pts}`;
      detail = rounds.map((value) => (value < 0 ? '✖' : String(value))).join('·');
      break;
    case 'higher-lower':
      summary = `📈 Higher or Lower · ${correct}/${roundCount} · ${pts}`;
      detail = symbols(rounds, '✅', '❌', '⌛');
      break;
    case 'shiny-vote':
      summary = `✨ Shiny Quiz · ${correct}/${roundCount} · ${pts}`;
      detail = symbols(rounds, '✨', '❌', '⌛');
      break;
    case 'learnset-guess':
      summary = `📚 Learnset Guess · ${correct}/${roundCount} · ${pts}`;
      detail = rounds.map((groups) => (groups >= 1 ? `${'⬛'.repeat(groups - 1)}🟩` : '🟥')).join(' ');
      break;
  }
  return [
    `Pokémon Universe · Reto diario ${formatDailyDate(input.date)}`,
    summary,
    detail,
    `${input.origin}/play`
  ].join('\n');
}
