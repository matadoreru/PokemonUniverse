export type GamePhase =
  | 'GAME_STARTING'
  | 'ROUND_ACTIVE'
  | 'ROUND_RESULTS'
  | 'TIEBREAKER_ACTIVE'
  | 'ROLE_REVEAL'
  | 'CLUE_PHASE'
  | 'VOTING'
  | 'VOTE_RESULTS'
  | 'ELIMINATION'
  | 'SELECTING_TYPES'
  | 'TYPE_REVEAL'
  | 'INVALID_COMBINATION'
  | 'POKEMON_SEARCH'
  | 'TURN_ACTIVE'
  | 'CHOICE_REVEAL'
  | 'DISCUSSION'
  | 'REVOTE'
  | 'GAME_RESULTS';

export type PokemonCryVersion = 'LATEST' | 'LEGACY';

export interface MiniGameManifest {
  id: string;
  name: string;
  icon: string;
  description: string;
  /** «Cómo se juega»: tres frases cortas (qué hacer, cómo se puntúa y un consejo), en la intro y en la ayuda. */
  howTo: string[];
  /** Marks recently introduced games that may still receive rule or balance changes. */
  experimental?: boolean;
  /** Highlights polished, approachable games in selection surfaces. */
  recommended?: boolean;
  minPlayers: number;
  maxPlayers?: number;
  /** Ms durante los que una desconexión no llega al motor; nunca alarga un plazo. */
  presenceGraceMs?: number;
  profileStats: ProfileStatsDefinition;
}

export function supportsPlayerCount(manifest: MiniGameManifest, playerCount: number): boolean {
  return playerCount >= manifest.minPlayers && (manifest.maxPlayers === undefined || playerCount <= manifest.maxPlayers);
}

export type ProfileMetricAggregation = 'SUM' | 'MAX' | 'MIN';
export interface ProfileMetricDefinition {
  key: string;
  label: string;
  aggregation: ProfileMetricAggregation;
  format?: 'NUMBER' | 'DURATION_MS';
}
export interface ProfileDerivedMetricDefinition {
  key: string;
  label: string;
  kind: 'PERCENT' | 'AVERAGE';
  numerator: string;
  denominator: readonly string[];
  format?: 'NUMBER' | 'DURATION_MS';
}
export interface ProfileStatsDefinition {
  metrics: readonly ProfileMetricDefinition[];
  derivedMetrics?: readonly ProfileDerivedMetricDefinition[];
}

export interface ProfileGameStats {
  gameId: string;
  gamesPlayed: number;
  gamesWon: number;
  points: number;
  metrics: Record<string, number>;
}

/** Nivel de una cuenta registrada: `levelXp` y `nextLevelXp` son la experiencia total donde empiezan este nivel y el siguiente. */
export interface LevelProgress {
  level: number;
  xp: number;
  levelXp: number;
  nextLevelXp: number;
}

/** «Perfil visible para»: quién ve el nivel, las estadísticas y los logros de la cuenta (el dueño siempre). */
export type ProfileVisibility = 'EVERYONE' | 'FRIENDS' | 'NOBODY';

export interface UserProfileResponse {
  user: { id: string; username: string; email: string; avatar: import('../avatar.js').AvatarRef; createdAt: string };
  globalStats: { gamesPlayed: number; gamesWon: number; totalPoints: number };
  /** Ausente en el oráculo Node, que no tiene experiencia. */
  progress?: LevelProgress;
  games: Array<Omit<MiniGameManifest, 'howTo'> & { stats: ProfileGameStats }>;
  /** Ausente en respuestas anteriores al ajuste; sin él vale `EVERYONE`. */
  profileVisibility?: ProfileVisibility;
}

export interface GameStanding {
  playerId: string;
  position: number;
  points: number;
  won?: boolean;
  stats: Record<string, number>;
}

export interface GameResults {
  winnerId: string | null;
  standings: GameStanding[];
  /** Solo `false` (si no, no sale): partida sin ganador ni derrota (Type Duel · Cooperativo), cuenta como jugada pero nunca como ganada, y el winrate la excluye (`unrankedGamesPlayed`). */
  ranked?: false;
}
