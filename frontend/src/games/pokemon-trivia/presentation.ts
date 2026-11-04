import { POKEMON_TRIVIA_QUESTION_TYPES, type GameResults, type PokemonTriviaOption, type PokemonTriviaOptionDetails, type PokemonTriviaOptionId, type PokemonTriviaPlayerState, type PokemonTriviaPublicState, type PokemonTriviaQuestionType, type PokemonTriviaRoundResult } from '@pokemon-universe/shared/public';

/** Nombre de cada categoría de pregunta (ajustes, cabecera y resultados). */
export const triviaCategoryLabels: Record<PokemonTriviaQuestionType, string> = {
  TYPE: 'Tipos', GENERATION: 'Generaciones', HP: 'PS', ATTACK: 'Ataque', DEFENSE: 'Defensa', SPECIAL_ATTACK: 'Ataque Esp.', SPECIAL_DEFENSE: 'Defensa Esp.', BST: 'BST', SPEED: 'Velocidad', HEIGHT: 'Altura', WEIGHT: 'Peso', DEX_NUMBER: 'N.º Pokédex',
};

export const triviaDifficultyLabels: Record<PokemonTriviaPublicState['difficulty'], string> = { EASY: 'Fácil', NORMAL: 'Normal', HARD: 'Difícil' };

const typeLabels: Record<string, string> = { normal: 'Normal', fire: 'Fuego', water: 'Agua', electric: 'Eléctrico', grass: 'Planta', ice: 'Hielo', fighting: 'Lucha', poison: 'Veneno', ground: 'Tierra', flying: 'Volador', psychic: 'Psíquico', bug: 'Bicho', rock: 'Roca', ghost: 'Fantasma', dragon: 'Dragón', dark: 'Siniestro', steel: 'Acero', fairy: 'Hada' };
const decimal = (value: number) => (value / 10).toLocaleString('es-ES');

/** El dato que compara la pregunta, en texto («Ataque 84», «1,7 m», «Fuego · Volador»). */
export function triviaComparedValue(type: PokemonTriviaQuestionType | null, details: PokemonTriviaOptionDetails): string | null {
  switch (type) {
    case 'HP': return `PS ${details.hp}`;
    case 'ATTACK': return `Ataque ${details.attack}`;
    case 'DEFENSE': return `Defensa ${details.defense}`;
    case 'SPECIAL_ATTACK': return `Ataque Esp. ${details.specialAttack}`;
    case 'SPECIAL_DEFENSE': return `Defensa Esp. ${details.specialDefense}`;
    case 'BST': return `BST ${details.baseStatTotal}`;
    case 'SPEED': return `Velocidad ${details.speed}`;
    case 'HEIGHT': return details.heightDecimeters !== undefined ? `${decimal(details.heightDecimeters)} m` : null;
    case 'WEIGHT': return details.weightHectograms !== undefined ? `${decimal(details.weightHectograms)} kg` : null;
    case 'DEX_NUMBER': return `Pokédex N.º ${details.nationalDexNumber}`;
    case 'GENERATION': return `Generación ${details.generation}`;
    case 'TYPE': return details.types.map((type) => typeLabels[type] ?? type).join(' · ');
    default: return null;
  }
}

/** La ficha entera de una opción en la revelación, en una línea («Gen 1 · PS 35 · Atq 55 · …»). */
export function triviaDetailsLine(details: PokemonTriviaOptionDetails): string {
  return [
    `Gen ${details.generation}`, `PS ${details.hp}`, `Atq ${details.attack}`, `Def ${details.defense}`, `At. Esp. ${details.specialAttack}`, `Def. Esp. ${details.specialDefense}`,
    `Vel. ${details.speed}`, `BST ${details.baseStatTotal}`,
    ...(details.heightDecimeters !== undefined ? [`${decimal(details.heightDecimeters)} m`] : []),
    ...(details.weightHectograms !== undefined ? [`${decimal(details.weightHectograms)} kg`] : []),
  ].join(' · ');
}

/** Atajo de teclado (1–4) de cada opción, por su orden. */
export const triviaShortcut = (index: number) => String(index + 1);

/** Opción que elige una tecla («1» → la primera), o `null`. */
export function triviaOptionFromKey(key: string, options: readonly Pick<PokemonTriviaOption, 'id'>[]): PokemonTriviaOptionId | null {
  if (!/^[1-4]$/.test(key)) return null;
  return options[Number(key) - 1]?.id ?? null;
}

/** «2 · Charmander»: el número de la opción (su atajo) y el Pokémon. */
export function triviaOptionLabel(options: readonly PokemonTriviaOption[], id: PokemonTriviaOptionId): string {
  const index = options.findIndex((option) => option.id === id);
  return index < 0 ? id : `${triviaShortcut(index)} · ${options[index]!.pokemon.name}`;
}

/** La revelación solo existe en `ROUND_RESULTS`: en la ronda siguiente `lastRound` podría seguir siendo la anterior. */
export const triviaVisibleRound = (game: Pick<PokemonTriviaPublicState, 'phase' | 'lastRound'>): PokemonTriviaRoundResult | null => (game.phase === 'ROUND_RESULTS' ? game.lastRound : null);

/** Placa de abajo: elegir, respuesta bloqueada, observar, fuera de la partida, revelación o esperar. */
export type TriviaPlateKind = 'answer' | 'locked' | 'watching' | 'out' | 'reveal' | 'waiting';

export function triviaPlateKind({ game, player }: { game: Pick<PokemonTriviaPublicState, 'phase' | 'lastRound'>; player: PokemonTriviaPlayerState | null }): TriviaPlateKind {
  if (game.phase === 'ROUND_RESULTS') return triviaVisibleRound(game) ? 'reveal' : 'waiting';
  if (game.phase !== 'ROUND_ACTIVE') return 'waiting';
  if (!player || player.role !== 'PLAYER') return 'watching';
  if (player.answer) return 'locked';
  return player.canAnswer ? 'answer' : 'out';
}

export const triviaFocusKey = (kind: TriviaPlateKind, roundNumber: number): string | null => (kind === 'waiting' ? null : `${kind}-${roundNumber}`);

/** Veredicto propio en la revelación. */
export interface TriviaVerdict { tone: 'ok' | 'bad' | 'info'; text: string; points: number }

export function triviaVerdict(result: PokemonTriviaRoundResult, options: readonly PokemonTriviaOption[], selfId: string, participating: boolean): TriviaVerdict {
  if (!participating) return { tone: 'info', text: 'Estabas observando', points: 0 };
  const answer = result.answers[selfId];
  if (!answer) return { tone: 'bad', text: 'Sin respuesta', points: 0 };
  const points = result.points[selfId] ?? 0;
  return answer.optionId === result.correctOptionId
    ? { tone: 'ok', text: `¡Correcta! Elegiste ${triviaOptionLabel(options, answer.optionId)}`, points }
    : { tone: 'bad', text: `Incorrecta: elegiste ${triviaOptionLabel(options, answer.optionId)}`, points };
}

/** Texto de la única región viva. */
export function triviaAnnouncement({ kind, game, player, verdict }: { kind: TriviaPlateKind; game: Pick<PokemonTriviaPublicState, 'roundNumber' | 'totalRounds' | 'prompt' | 'options' | 'lastRound' | 'phase'>; player: PokemonTriviaPlayerState | null; verdict: TriviaVerdict | null }): string {
  const round = `Pregunta ${game.roundNumber} de ${game.totalRounds}`;
  switch (kind) {
    case 'answer': return `${round}: ${game.prompt ?? ''} Elige con las teclas 1 a ${game.options.length}.`;
    case 'locked': return `Respuesta ${triviaOptionLabel(game.options, player!.answer!.optionId)} bloqueada. Esperando al resto.`;
    case 'watching': case 'out': return `${round}: ${game.prompt ?? ''}`;
    case 'reveal': {
      const result = triviaVisibleRound(game)!;
      const correct = triviaOptionLabel(game.options, result.correctOptionId);
      return `Pregunta ${game.roundNumber} resuelta: la correcta era ${correct}. ${verdict?.text ?? ''}${verdict && verdict.points > 0 ? `, +${verdict.points} puntos` : ''}.`;
    }
    default: return '';
  }
}

/** Puestos del marcador por puntos (los empates comparten puesto), en el orden de la sala. */
export function triviaRanking(ids: readonly string[], scores: Readonly<Record<string, number>>): { id: string; position: number }[] {
  const sorted = [...ids].sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0));
  return sorted.map((id) => ({ id, position: sorted.findIndex((other) => (scores[other] ?? 0) === (scores[id] ?? 0)) + 1 }));
}

type Stats = GameResults['standings'][number]['stats'];
const num = (stats: Stats, key: string) => Number(stats[key] ?? 0);

/** Aciertos y respuestas de cada categoría que salió («Tipos 2/3»), en el orden de los ajustes. */
export function triviaCategoryScores(stats: Stats): { type: PokemonTriviaQuestionType; label: string; correct: number; answers: number }[] {
  return POKEMON_TRIVIA_QUESTION_TYPES.flatMap((type) => {
    const key = type.toLowerCase();
    const answers = num(stats, `${key}Answers`);
    return answers ? [{ type, label: triviaCategoryLabels[type], correct: num(stats, `${key}Correct`), answers }] : [];
  });
}

/** Precisión en % (aciertos entre respuestas dadas). */
export function triviaAccuracy(stats: Stats): number {
  const answers = num(stats, 'answers');
  return answers ? Math.round(num(stats, 'correct') / answers * 100) : 0;
}
